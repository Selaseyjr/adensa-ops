// Adensa Ops worker: D1-backed record sync + static SPA.
//
// API:
//   OPTIONS /api/records            -> CORS preflight (allowlisted origins)
//   GET  /api/records?mode=demo|real  -> { mode, records|null, updatedAt|null }
//   PUT  /api/records?mode=demo|real  -> { ok: true, updatedAt }
//
// Records are the operator-created UI records (quotes, orders, customers,
// inquiries, cash, status overrides). One JSON document per data mode, so the
// demo/real isolation guarantee holds server-side too. The client stays
// local-first: it renders from localStorage immediately and treats any API
// failure as "no backend yet" (the app works exactly as before).
//
// Security posture (matches AGENTS.md: PIN is a client-side speed bump, not
// server auth):
// - writes rejected when the Origin header is neither same-origin nor an
//   allowlisted frontend (CSRF guard),
// - CORS answers only for the allowlisted frontends (the Vercel build has no
//   worker of its own and uses this API as its shared backend),
// - mode is an allowlist, payload shape is validated and size-capped,
// - responses are private/no-store; no credentials or tokens anywhere.

const MODES = new Set(['demo', 'real'])
const MAX_BODY_BYTES = 1_000_000

const ARRAY_FIELDS = ['customers', 'orders', 'inquiries', 'quotes', 'cash']
const OBJECT_FIELDS = ['quoteOverrides', 'orderOverrides']

// Cross-origin browser access is limited to our own frontends:
//  - https://adensaops.vercel.app            (Vercel production alias)
//  - https://adensaops-<random>-<team>...    (per-deploy Vercel previews)
// Everything else keeps the old behaviour: reads are CORS-blocked in the
// browser, writes are rejected outright. (Local dev talks same-origin - via a
// Vite proxy or wrangler's own host - so it needs no CORS grant.)
const CORS_EXTRA_ORIGINS = new Set(['https://adensaops.vercel.app'])
const CORS_ORIGIN_PATTERNS = [/^https:\/\/adensaops-[a-z0-9-]+\.vercel\.app$/]

function isAllowlistedCorsOrigin(origin) {
  if (CORS_EXTRA_ORIGINS.has(origin)) return true
  return CORS_ORIGIN_PATTERNS.some((re) => re.test(origin))
}

/**
 * Origin to echo in CORS headers, or null when CORS must not be granted
 * (no Origin header, or same-origin — which needs no CORS header at all).
 */
function corsAllowedOrigin(request, url) {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  try {
    if (new URL(origin).origin === url.origin) return null
  } catch {
    return null
  }
  return isAllowlistedCorsOrigin(origin) ? origin : null
}

/** Write guard: no Origin (non-browser), same-origin, or allowlisted frontend. */
function isWriteAllowed(request, url) {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    if (new URL(origin).origin === url.origin) return true
  } catch {
    return false
  }
  return isAllowlistedCorsOrigin(origin)
}

/** CORS preflight answer for allowlisted origins; 403 for anyone else. */
function preflightResponse(corsOrigin) {
  if (!corsOrigin) return new Response(null, { status: 403 })
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-methods': 'GET, PUT, OPTIONS',
      'access-control-allow-headers': 'accept, content-type',
      'access-control-max-age': '86400',
      vary: 'Origin',
    },
  })
}

function json(body, status = 200, corsOrigin = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  }
  if (corsOrigin) {
    headers['access-control-allow-origin'] = corsOrigin
    headers.vary = 'Origin'
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

/** Validate + normalise a payload into a full LocalRecords shape, or null. */
function normaliseRecords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  for (const field of ARRAY_FIELDS) {
    const value = raw[field]
    if (value === undefined) {
      out[field] = []
    } else if (Array.isArray(value)) {
      out[field] = value
    } else {
      return null
    }
  }
  for (const field of OBJECT_FIELDS) {
    const value = raw[field]
    if (value === undefined) {
      out[field] = {}
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[field] = value
    } else {
      return null
    }
  }
  return out
}

// Schema is created once per database handle on first use: controlled
// server-side migration, no manual SQL step after provisioning. Tracked per
// handle (not per isolate) so a re-bound DB re-runs the idempotent CREATE.
const schemaReady = new WeakSet()
async function ensureSchema(db) {
  if (schemaReady.has(db)) return
  await db.exec(
    'CREATE TABLE IF NOT EXISTS records (mode TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)',
  )
  schemaReady.add(db)
}

async function handleApi(request, env, url, corsOrigin) {
  const mode = url.searchParams.get('mode') ?? ''
  if (!MODES.has(mode)) return json({ ok: false, error: 'mode must be "demo" or "real"' }, 400, corsOrigin)
  if (!env || !env.DB) return json({ ok: false, error: 'database unavailable' }, 503, corsOrigin)

  const db = env.DB
  await ensureSchema(db)

  if (request.method === 'GET') {
    const row = await db.prepare('SELECT payload, updated_at FROM records WHERE mode = ?').bind(mode).first()
    let records = null
    if (row && typeof row.payload === 'string') {
      try {
        records = JSON.parse(row.payload)
      } catch {
        records = null
      }
    }
    return json({ ok: true, mode, records, updatedAt: row?.updated_at ?? null }, 200, corsOrigin)
  }

  if (request.method === 'PUT') {
    if (!isWriteAllowed(request, url)) {
      return json({ ok: false, error: 'cross-origin writes are not allowed' }, 403, corsOrigin)
    }

    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'payload too large' }, 413, corsOrigin)

    let raw
    try {
      raw = await request.text()
    } catch {
      return json({ ok: false, error: 'unreadable body' }, 400, corsOrigin)
    }
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'payload too large' }, 413, corsOrigin)

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return json({ ok: false, error: 'body must be JSON' }, 400, corsOrigin)
    }

    const records = normaliseRecords(parsed)
    if (!records) return json({ ok: false, error: 'invalid records shape' }, 400, corsOrigin)

    const updatedAt = new Date().toISOString()
    await db
      .prepare(
        'INSERT INTO records (mode, payload, updated_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(mode) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
      )
      .bind(mode, JSON.stringify(records), updatedAt)
      .run()
    return json({ ok: true, mode, updatedAt }, 200, corsOrigin)
  }

  return json({ ok: false, error: 'method not allowed' }, 405, corsOrigin)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const corsOrigin = corsAllowedOrigin(request, url)
      if (request.method === 'OPTIONS') return preflightResponse(corsOrigin)
      try {
        return await handleApi(request, env, url, corsOrigin)
      } catch {
        // Never let a D1 hiccup take down the SPA: the API reports the
        // failure, the client falls back to localStorage.
        return json({ ok: false, error: 'server error' }, 500, corsOrigin)
      }
    }
    return env.ASSETS.fetch(request)
  },
}
