// Local-first sync tests: merge precedence, backend-absent fallbacks, and the
// debounced push queue. fetch is stubbed, so this runs without a server —
// the real round trip is covered by the worker tests and `wrangler dev`.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalRecords } from './localData'
import { mergeRecords } from './localData'
import { createPushQueue, fetchRemoteRecords, hydrateRecords, pushRecords } from './remote'

const EMPTY: LocalRecords = {
  customers: [],
  orders: [],
  inquiries: [],
  quotes: [],
  cash: [],
  quoteOverrides: {},
  orderOverrides: {},
}

const quote = (id: string) => ({
  id,
  customerId: 'c1',
  valueGhs: 100,
  sentOn: '2026-10-15',
  status: 'sent' as const,
  orderIds: [],
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mergeRecords', () => {
  it('unions arrays by id so records from another device arrive', () => {
    const local: LocalRecords = { ...EMPTY, quotes: [quote('QT-001')] }
    const remote: LocalRecords = { ...EMPTY, quotes: [quote('QT-002')] }
    const merged = mergeRecords(local, remote)
    expect(merged.quotes.map((q) => q.id).sort()).toEqual(['QT-001', 'QT-002'])
  })

  it('keeps the local copy when both sides hold the same id', () => {
    const local: LocalRecords = { ...EMPTY, quotes: [{ ...quote('QT-001'), valueGhs: 999 }] }
    const remote: LocalRecords = { ...EMPTY, quotes: [{ ...quote('QT-001'), valueGhs: 111 }] }
    expect(mergeRecords(local, remote).quotes[0].valueGhs).toBe(999)
  })

  it('merges overrides key-by-key with local precedence', () => {
    const local: LocalRecords = { ...EMPTY, orderOverrides: { 'ORD-1': { stage: 'delivered' } } }
    const remote: LocalRecords = {
      ...EMPTY,
      orderOverrides: { 'ORD-1': { stage: 'ordered' }, 'ORD-2': { stage: 'settled' } },
    }
    const merged = mergeRecords(local, remote)
    expect(merged.orderOverrides['ORD-1'].stage).toBe('delivered')
    expect(merged.orderOverrides['ORD-2'].stage).toBe('settled')
  })

  it('never drops records when one side is empty', () => {
    const local: LocalRecords = { ...EMPTY, quotes: [quote('QT-001')] }
    expect(mergeRecords(local, EMPTY).quotes).toHaveLength(1)
    expect(mergeRecords(EMPTY, local).quotes).toHaveLength(1)
  })
})

describe('fetchRemoteRecords', () => {
  it('returns null when the backend is absent (HTML fallback from the SPA)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>index</html>', { status: 200, headers: { 'content-type': 'text/html' } })),
    )
    expect(await fetchRemoteRecords('demo')).toBeNull()
  })

  it('returns null on network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await fetchRemoteRecords('real')).toBeNull()
  })

  it('returns null on a 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":false}', { status: 500, headers: { 'content-type': 'application/json' } })),
    )
    expect(await fetchRemoteRecords('demo')).toBeNull()
  })

  it('parses a valid payload', async () => {
    const records = { ...EMPTY, quotes: [quote('QT-007')] }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, records }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const got = await fetchRemoteRecords('demo')
    expect(got?.quotes[0].id).toBe('QT-007')
  })
})

describe('pushRecords', () => {
  it('PUTs the full record set and reports success', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const ok = await pushRecords('demo', { ...EMPTY, quotes: [quote('QT-001')] })
    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/records?mode=demo')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body)).quotes).toHaveLength(1)
  })

  it('reports false (not an error) when there is no backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })),
    )
    expect(await pushRecords('demo', EMPTY)).toBe(false)
  })
})

describe('hydrateRecords', () => {
  it('merges remote into local, applies the union, and pushes it back', async () => {
    const local: LocalRecords = { ...EMPTY, quotes: [quote('QT-001')] }
    const remote: LocalRecords = { ...EMPTY, quotes: [quote('QT-002')] }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || !init.method) {
        return new Response(JSON.stringify({ ok: true, records: remote }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    let applied: LocalRecords | null = null
    const out = await hydrateRecords('demo', local, (merged) => {
      applied = merged
    })

    expect(applied).not.toBeNull()
    expect(applied!.quotes.map((q) => q.id).sort()).toEqual(['QT-001', 'QT-002'])
    expect(out.quotes).toHaveLength(2)
    // Second call is the convergence push.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putCall = fetchMock.mock.calls.find(([, init]) => init && init.method === 'PUT')
    expect(putCall).toBeTruthy()
  })

  it('leaves local untouched when there is no backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })),
    )
    const local: LocalRecords = { ...EMPTY, quotes: [quote('QT-001')] }
    let applied = false
    const out = await hydrateRecords('demo', local, () => {
      applied = true
    })
    expect(applied).toBe(false)
    expect(out).toEqual(local)
  })
})

describe('createPushQueue', () => {
  it('collapses rapid edits into one debounced write', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const push = createPushQueue('demo')
    push({ ...EMPTY, quotes: [quote('QT-001')] })
    push({ ...EMPTY, quotes: [quote('QT-001'), quote('QT-002')] })
    push({ ...EMPTY, quotes: [quote('QT-001'), quote('QT-002'), quote('QT-003')] })
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(900)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).quotes).toHaveLength(3)

    vi.useRealTimers()
  })
})
