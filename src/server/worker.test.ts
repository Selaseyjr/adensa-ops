// Worker API tests: route validation, origin guard, payload validation, and
// the D1 read/write contract, exercised against an in-memory fake DB so the
// suite runs without workerd. The real D1 round trip is verified separately
// with `wrangler dev` (local Miniflare) before every deploy.

import { describe, expect, it, vi } from 'vitest'
import worker from '../../worker.js'

interface FakeDB {
  rows: Map<string, { payload: string; updated_at: string }>
  datasets: Map<string, { payload: string }>
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
  const datasets = new Map<string, { payload: string }>()
  const execCalls: string[] = []
  return {
    rows,
    datasets,
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
            if (sql.includes('FROM datasets')) return (datasets.get(params[0]) as never) ?? null
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

/** Call the worker with a fake env (records tests; staff auth lives in staff.test.ts). */
async function call(path: string, init: RequestInit = {}, db: FakeDB = fakeDb()) {
  const request = new Request(`https://ops.example.com${path}`, init)
  const env = { DB: db, ASSETS, SESSION_SECRET: 'x'.repeat(40) } as never
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
  it('PUTs then GETs demo records, and never serves real records without sign-in', async () => {
    const db = fakeDb()
    const payload = { quotes: [{ id: 'QT-901', customerId: 'c1' }] }

    const put = await call('/api/records?mode=demo', { method: 'PUT', body: JSON.stringify(payload) }, db)
    expect(put.status).toBe(200)
    const body = (await (await call('/api/records?mode=demo', {}, db)).json()) as { records: { quotes: unknown[] } }
    expect(body.records.quotes).toHaveLength(1)

    expect((await call('/api/records?mode=real', {}, db)).status).toBe(401)
    expect((await call('/api/records?mode=real', { method: 'PUT', body: '{}' }, db)).status).toBe(401)
    expect(db.rows.has('real')).toBe(false)

    // Schema initialised exactly once across requests.
    expect(db.execCalls.filter((sql) => sql.includes('CREATE TABLE IF NOT EXISTS records'))).toHaveLength(1)
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

describe('worker: CORS for the Vercel frontend', () => {
  const VERCEL = 'https://adensaops.vercel.app'

  it('answers a preflight from the production origin', async () => {
    const res = await call('/api/records?mode=demo', {
      method: 'OPTIONS',
      headers: {
        Origin: VERCEL,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(VERCEL)
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT')
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type')
  })

  it('answers a preflight from a per-deploy preview origin', async () => {
    const origin = 'https://adensaops-bd8lb14ni-selasey.vercel.app'
    const res = await call('/api/records?mode=demo', { method: 'OPTIONS', headers: { Origin: origin } })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(origin)
  })

  it('403s a preflight from a foreign origin', async () => {
    const res = await call('/api/records?mode=demo', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('allows writes from the allowlisted origin and echoes CORS', async () => {
    const db = fakeDb()
    const res = await call(
      '/api/records?mode=demo',
      { method: 'PUT', body: JSON.stringify({ quotes: [{ id: 'QT-C1' }] }), headers: { Origin: VERCEL } },
      db,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(VERCEL)
    expect(res.headers.get('vary')).toContain('Origin')
    expect(JSON.parse(db.rows.get('demo')!.payload).quotes[0].id).toBe('QT-C1')
  })

  it('exposes reads to the allowlisted origin with CORS headers', async () => {
    const res = await call('/api/records?mode=demo', { headers: { Origin: VERCEL } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(VERCEL)
  })

  it('grants no CORS headers to foreign origins on reads', async () => {
    const res = await call('/api/records?mode=demo', { headers: { Origin: 'https://evil.example' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})


describe('worker: production domains and routing', () => {
  it('allows the production and app domains through CORS', async () => {
    for (const origin of ['https://adensaops.com', 'https://app.adensaops.com']) {
      const res = await call('/api/auth/login', { method: 'OPTIONS', headers: { origin } })
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
    }
  })

  it('has no PIN endpoint any more', async () => {
    expect((await call('/api/session', { method: 'POST', body: '{"pin":"x"}' })).status).toBe(404)
  })

  it('404s unknown API paths instead of treating them as records', async () => {
    expect((await call('/api/nope?mode=demo')).status).toBe(404)
  })
})
