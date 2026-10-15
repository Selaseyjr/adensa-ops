// Worker API tests: route validation, origin guard, payload validation, and
// the D1 read/write contract, exercised against an in-memory fake DB so the
// suite runs without workerd. The real D1 round trip is verified separately
// with `wrangler dev` (local Miniflare) before every deploy.

import { describe, expect, it, vi } from 'vitest'
import worker from '../../worker.js'

interface FakeDB {
  rows: Map<string, { payload: string; updated_at: string }>
  execCalls: string[]
  exec: (sql: string) => Promise<unknown>
  prepare: (sql: string) => {
    bind: (...params: string[]) => {
      first: () => Promise<{ payload: string; updated_at: string } | null>
      run: () => Promise<{ success: boolean }>
    }
  }
}

function fakeDb(): FakeDB {
  const rows = new Map<string, { payload: string; updated_at: string }>()
  const execCalls: string[] = []
  return {
    rows,
    execCalls,
    async exec(sql: string) {
      execCalls.push(sql)
      return null
    },
    prepare(sql: string) {
      return {
        bind: (...params: string[]) => ({
          first: async () => {
            if (sql.includes('FROM records')) return rows.get(params[0]) ?? null
            return null
          },
          run: async () => {
            if (sql.includes('INSERT INTO records')) {
              rows.set(params[0], { payload: params[1], updated_at: params[2] })
            }
            return { success: true }
          },
        }),
      }
    },
  }
}

const ASSETS = { fetch: vi.fn(async () => new Response('asset')) }

/** Call the worker with a fake env; returns the response and the db used. */
function call(path: string, init: RequestInit = {}, db: FakeDB = fakeDb()) {
  const request = new Request(`https://ops.example.com${path}`, init)
  const env = { DB: db, ASSETS } as never
  return worker.fetch(request, env)
}

describe('worker: routing', () => {
  it('serves the SPA for non-API paths', async () => {
    const res = await call('/orders')
    expect(await res.text()).toBe('asset')
    expect(ASSETS.fetch).toHaveBeenCalled()
  })

  it('405s an unsupported method on the API', async () => {
    const res = await call('/api/records?mode=demo', { method: 'DELETE' })
    expect(res.status).toBe(405)
  })
})

describe('worker: validation', () => {
  it('rejects an unknown mode', async () => {
    const res = await call('/api/records?mode=nope')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/mode/)
  })

  it('defaults missing/empty mode to a 400', async () => {
    const res = await call('/api/records')
    expect(res.status).toBe(400)
  })

  it('rejects malformed JSON bodies', async () => {
    const res = await call('/api/records?mode=demo', {
      method: 'PUT',
      body: '{not json',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('rejects wrong-shaped payloads (quotes must be an array)', async () => {
    const res = await call('/api/records?mode=demo', {
      method: 'PUT',
      body: JSON.stringify({ quotes: 'nope' }),
    })
    expect(res.status).toBe(400)
  })

  it('normalises missing sections so the client always reads a full record set', async () => {
    const db = fakeDb()
    const res = await call(
      '/api/records?mode=demo',
      { method: 'PUT', body: JSON.stringify({ quotes: [{ id: 'QT-901' }] }) },
      db,
    )
    expect(res.status).toBe(200)
    const stored = JSON.parse(db.rows.get('demo')!.payload)
    expect(stored.quotes).toHaveLength(1)
    expect(stored.customers).toEqual([])
    expect(stored.orderOverrides).toEqual({})
  })
})

describe('worker: cross-origin guard', () => {
  it('rejects writes from a foreign origin', async () => {
    const res = await call(
      '/api/records?mode=demo',
      {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { Origin: 'https://evil.example' },
      },
    )
    expect(res.status).toBe(403)
  })

  it('allows writes from the same origin', async () => {
    const res = await call(
      '/api/records?mode=demo',
      {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { Origin: 'https://ops.example.com' },
      },
    )
    expect(res.status).toBe(200)
  })
})

describe('worker: D1 round trip', () => {
  it('PUTs then GETs records back per mode, keeping modes isolated', async () => {
    const db = fakeDb()
    const payload = { quotes: [{ id: 'QT-901', customerId: 'c1' }] }

    const put = await call('/api/records?mode=real', { method: 'PUT', body: JSON.stringify(payload) }, db)
    expect(put.status).toBe(200)
    expect((await put.json()).ok).toBe(true)

    const getReal = await call('/api/records?mode=real', {}, db)
    const realBody = (await getReal.json()) as {
      ok: boolean
      records: { quotes: unknown[] }
    }
    expect(realBody.ok).toBe(true)
    expect(realBody.records.quotes).toHaveLength(1)

    const getDemo = await call('/api/records?mode=demo', {}, db)
    const demoBody = (await getDemo.json()) as { records: unknown }
    expect(demoBody.records).toBeNull()

    // Schema initialised exactly once across requests.
    expect(db.execCalls.filter((sql) => sql.includes('CREATE TABLE'))).toHaveLength(1)
  })

  it('overwrites on repeat PUT (last write wins, updatedAt advances)', async () => {
    const db = fakeDb()
    const putOnce = (payload: unknown) =>
      call('/api/records?mode=demo', { method: 'PUT', body: JSON.stringify(payload) }, db)
    const first = (await (await putOnce({ quotes: [{ id: 'QT-1' }] })).json()) as { updatedAt: string }
    await new Promise((r) => setTimeout(r, 5))
    const second = (await (await putOnce({ quotes: [{ id: 'QT-2' }] })).json()) as { updatedAt: string }
    expect(second.updatedAt >= first.updatedAt).toBe(true)
    expect(JSON.parse(db.rows.get('demo')!.payload).quotes[0].id).toBe('QT-2')
  })

  it('survives a corrupt stored payload (client falls back to null, not a crash)', async () => {
    const db = fakeDb()
    db.rows.set('demo', { payload: 'corrupt{', updated_at: '2026-10-15T00:00:00Z' })
    const res = await call('/api/records?mode=demo', {}, db)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { records: unknown }).records).toBeNull()
  })

  it('returns 500 (not a crash) when the database throws', async () => {
    const db = fakeDb()
    db.exec = async () => {
      throw new Error('disk on fire')
    }
    const res = await call('/api/records?mode=demo', {}, db)
    expect(res.status).toBe(500)
  })
})
