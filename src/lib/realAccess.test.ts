import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRealDataset, getRealToken, isRealUnlocked, lockReal, unlockReal } from './realAccess'
import { fetchRemoteRecords } from './remote'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('Real mode access (server-verified)', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the PIN to the worker and keeps only the signed token', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, token: 'real.9999999999999.sig', expiresAt: Date.now() + 60_000 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await unlockReal('the-pin')).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/session')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ pin: 'the-pin' })
    expect(isRealUnlocked()).toBe(true)
    expect(getRealToken()).toBe('real.9999999999999.sig')
    expect(sessionStorage.getItem('adensa.realSession')).not.toContain('the-pin')
  })

  it('maps wrong PIN, lockout and missing backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false }, 401)))
    expect(await unlockReal('x')).toBe('wrong')
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false }, 429)))
    expect(await unlockReal('x')).toBe('locked')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))
    expect(await unlockReal('x')).toBe('unavailable')
    expect(isRealUnlocked()).toBe(false)
  })

  it('treats an expired session as locked', () => {
    sessionStorage.setItem('adensa.realSession', JSON.stringify({ token: 't', expiresAt: Date.now() - 1 }))
    expect(isRealUnlocked()).toBe(false)
  })

  it('fetches the real dataset with the bearer token, and locks on 401', async () => {
    sessionStorage.setItem('adensa.realSession', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 60_000 }))
    const fetchMock = vi.fn(async () => json({ ok: true, dataset: { suppliers: [{ id: 'sup-001' }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const ds = await fetchRealDataset()
    expect(ds?.suppliers).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/real-dataset')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')

    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false }, 401)))
    expect(await fetchRealDataset()).toBeNull()
    expect(isRealUnlocked()).toBe(false)
  })

  it('returns null without a session and never calls the API', async () => {
    lockReal()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchRealDataset()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the session token with real record sync only', async () => {
    sessionStorage.setItem('adensa.realSession', JSON.stringify({ token: 'tok', expiresAt: Date.now() + 60_000 }))
    const fetchMock = vi.fn(async () => json({ ok: true, records: null }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRemoteRecords('real', '')
    await fetchRemoteRecords('demo', '')
    const headers = fetchMock.mock.calls.map((c) => ((c as unknown as [string, RequestInit])[1].headers ?? {}) as Record<string, string>)
    expect(headers[0].authorization).toBe('Bearer tok')
    expect(headers[1].authorization).toBeUndefined()
  })
})
