// Worker API tests: route validation, origin guard, payload validation, and
// the D1 read/write contract, exercised against an in-memory fake DB so the
// suite runs without workerd. The real D1 round trip is verified separately
// with `wrangler dev` (local Miniflare) before every deploy.

import { describe, expect, it, vi } from 'vitest'
import worker, { issueToken, verifyToken } from '../../worker.js'

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

// A throwaway PIN for tests: the worker reads its hash from env, exactly as
// production reads the REAL_PIN_* secrets. (The real PIN is never in source.)
const TEST_PIN = 'test-pin-4821'
const TEST_SALT = '00112233445566778899aabbccddeeff'
const TEST_ITERATIONS = 1000
let testHash = ''
async function pinEnv() {
  if (!testHash) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(TEST_PIN), 'PBKDF2', false, ['deriveBits'])
    const salt = new Uint8Array(TEST_SALT.match(/../g)!.map((h) => parseInt(h, 16)))
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: TEST_ITERATIONS, hash: 'SHA-256' }, key, 256)
    testHash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return { REAL_PIN_HASH: testHash, REAL_PIN_SALT: TEST_SALT, REAL_PIN_ITERATIONS: String(TEST_ITERATIONS) }
}

/** Call the worker with a fake env; returns the response and the db used. */
async function call(path: string, init: RequestInit = {}, db: FakeDB = fakeDb(), secrets = true) {
  const request = new Request(`https://ops.example.com${path}`, init)
  const env = { DB: db, ASSETS, ...(secrets ? await pinEnv() : {}) } as never
  return worker.fetch(request, env)
}

async function realToken(): Promise<string> {
  return (await issueToken(await pinEnv())).token
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

    const auth = { authorization: `Bearer ${await realToken()}` }
    const put = await call('/api/records?mode=real', { method: 'PUT', headers: auth, body: JSON.stringify(payload) }, db)
    expect(put.status).toBe(200)
    expect((await put.json()).ok).toBe(true)

    const getReal = await call('/api/records?mode=real', { headers: auth }, db)
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


describe('worker: Real mode is verified server-side', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    call('/api/session', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

  it('issues a session token for the right PIN only', async () => {
    const bad = await post({ pin: 'wrong-pin' }, { 'cf-connecting-ip': '198.51.100.1' })
    expect(bad.status).toBe(401)
    const good = await post({ pin: TEST_PIN }, { 'cf-connecting-ip': '198.51.100.2' })
    expect(good.status).toBe(200)
    const body = (await good.json()) as { ok: boolean; token: string; expiresAt: number }
    expect(body.ok).toBe(true)
    expect(await verifyToken(await pinEnv(), body.token)).toBe(true)
    expect(body.expiresAt).toBeGreaterThan(Date.now())
  })

  it('locks an address out after repeated wrong PINs', async () => {
    const ip = { 'cf-connecting-ip': '198.51.100.9' }
    for (let i = 0; i < 5; i++) expect((await post({ pin: `nope-${i}` }, ip)).status).toBe(401)
    expect((await post({ pin: TEST_PIN }, ip)).status).toBe(429)
  }, 15_000)

  it('rejects malformed bodies and cross-origin session requests', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ pin: TEST_PIN }, { origin: 'https://evil.example' })).status).toBe(403)
  })

  it('serves the real dataset from D1 only to a valid session', async () => {
    const db = fakeDb()
    db.datasets.set('real', { payload: JSON.stringify({ suppliers: [{ id: 'sup-x' }] }) })
    expect((await call('/api/real-dataset', {}, db)).status).toBe(401)
    expect(
      (await call('/api/real-dataset', { headers: { authorization: 'Bearer real.9999999999999.forged' } }, db)).status,
    ).toBe(401)
    const res = await call('/api/real-dataset', { headers: { authorization: `Bearer ${await realToken()}` } }, db)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { dataset: { suppliers: unknown[] } }
    expect(body.dataset.suppliers).toEqual([{ id: 'sup-x' }])
  })

  it('reports a dataset that has not been loaded yet', async () => {
    const res = await call('/api/real-dataset', { headers: { authorization: `Bearer ${await realToken()}` } })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toMatch(/not loaded/)
  })

  it('refuses sign-in until the PIN secrets are set (no hash in the code)', async () => {
    const res = await call(
      '/api/session',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: TEST_PIN }) },
      fakeDb(),
      false,
    )
    expect(res.status).toBe(503)
    // A token minted under other secrets is worthless without them.
    expect(await verifyToken({}, await realToken())).toBe(false)
  })

  it('rejects expired tokens', async () => {
    const env = await pinEnv()
    const { token } = await issueToken(env, Date.now() - 13 * 60 * 60 * 1000)
    expect(await verifyToken(env, token)).toBe(false)
  })

  it('requires the session for real records but not demo records', async () => {
    expect((await call('/api/records?mode=real')).status).toBe(401)
    expect((await call('/api/records?mode=real', { method: 'PUT', body: '{}' })).status).toBe(401)
    expect((await call('/api/records?mode=demo')).status).toBe(200)
  })

  it('allows the production domain through CORS', async () => {
    const res = await call('/api/session', { method: 'OPTIONS', headers: { origin: 'https://adensaops.com' } })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://adensaops.com')
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
  })

  it('404s unknown API paths instead of treating them as records', async () => {
    expect((await call('/api/nope?mode=demo')).status).toBe(404)
  })
})
