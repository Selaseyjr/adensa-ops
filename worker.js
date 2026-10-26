// AdensaOps worker: D1-backed record sync, PIN-verified Real mode, static SPA.
//
// API:
//   OPTIONS /api/*                        -> CORS preflight (allowlisted origins)
//   POST /api/session      { pin }        -> { ok, token, expiresAt } | 401 | 429
//   GET  /api/real-dataset  (Bearer token) -> { ok, dataset }          | 401
//   GET  /api/records?mode=demo|real       -> { mode, records|null, updatedAt|null }
//   PUT  /api/records?mode=demo|real       -> { ok: true, updatedAt }
//   (mode=real requires the Bearer token on both GET and PUT)
//
// Records are the operator-created UI records (quotes, orders, customers,
// inquiries, cash, status overrides). One JSON document per data mode, so the
// demo/real isolation guarantee holds server-side too. The client stays
// local-first: it renders from localStorage immediately and treats any API
// failure as "no backend yet".
//
// Security posture:
// - Real mode is verified HERE: the PIN is checked against a PBKDF2-SHA256
//   hash (worker secrets REAL_PIN_HASH/REAL_PIN_SALT/REAL_PIN_ITERATIONS, or
//   server/pin-hash.js), and a short-lived HMAC-signed session token unlocks
//   the real dataset and real records. The real dataset lives in
//   server/real-dataset.js and is never part of the frontend bundle.
// - Repeated wrong PINs from one address are locked out for a minute
//   (best effort, per isolate) and every failure is slowed down.
// - Writes are rejected when the Origin header is neither same-origin nor an
//   allowlisted frontend (CSRF guard); CORS answers only allowlisted origins.
// - mode is an allowlist, payload shape is validated and size-capped,
//   responses are no-store.

import realDataset from './server/real-dataset.js'
import { PIN_HASH, PIN_ITERATIONS, PIN_SALT } from './server/pin-hash.js'

const MODES = new Set(['demo', 'real'])
const MAX_BODY_BYTES = 1_000_000

const ARRAY_FIELDS = ['customers', 'orders', 'inquiries', 'quotes', 'cash']
const OBJECT_FIELDS = ['quoteOverrides', 'orderOverrides']

// Cross-origin browser access is limited to our own frontends:
//  - https://adensaops.com, https://www.adensaops.com (production domain)
//  - https://adensaops.vercel.app            (Vercel production alias)
//  - https://adensaops-<random>-<team>...    (per-deploy Vercel previews)
// Everything else: reads are CORS-blocked in the browser, writes are
// rejected outright. (The Vercel deployment normally proxies /api to this
// worker, so the browser talks same-origin; the allowlist also covers the
// proxied Origin header and direct cross-origin calls.)
const CORS_EXTRA_ORIGINS = new Set([
  'https://adensaops.com',
  'https://www.adensaops.com',
  'https://adensaops.vercel.app',
])
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
      'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
      'access-control-allow-headers': 'accept, content-type, authorization',
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

/* ------------------------------ Real-mode auth ------------------------------ */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_FAILURES = 5
const LOCKOUT_MS = 60 * 1000
const FAIL_DELAY_MS = 400
/** Failed PIN attempts per client address (best effort, per isolate). */
const failures = new Map()

const enc = new TextEncoder()

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison of two strings of equal expected length. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** PIN hash settings: worker secrets win over the committed server module. */
function pinConfig(env) {
  return {
    hash: env?.REAL_PIN_HASH || PIN_HASH,
    salt: env?.REAL_PIN_SALT || PIN_SALT,
    iterations: Number(env?.REAL_PIN_ITERATIONS) || PIN_ITERATIONS,
  }
}

async function verifyPin(env, pin) {
  const { hash, salt, iterations } = pinConfig(env)
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(salt), iterations, hash: 'SHA-256' }, key, 256)
  return safeEqual(toHex(bits), hash)
}

/** HMAC key for session tokens: SESSION_SECRET, else derived from the PIN hash (a PIN change logs everyone out). */
function hmacKey(env) {
  const { hash, salt } = pinConfig(env)
  const secret = env?.SESSION_SECRET || `adensaops-session:${hash}:${salt}`
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function sign(env, message) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(message))
  return toHex(sig)
}

export async function issueToken(env, now = Date.now()) {
  const expiresAt = now + SESSION_TTL_MS
  const body = `real.${expiresAt}`
  return { token: `${body}.${await sign(env, body)}`, expiresAt }
}

export async function verifyToken(env, token, now = Date.now()) {
  if (typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'real') return false
  const expiresAt = Number(parts[1])
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false
  return safeEqual(parts[2], await sign(env, `${parts[0]}.${parts[1]}`))
}

function bearer(request) {
  const h = request.headers.get('authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

async function isRealSession(request, env) {
  return verifyToken(env, bearer(request))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function handleSession(request, env, url, corsOrigin) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405, corsOrigin)
  if (!isWriteAllowed(request, url)) return json({ ok: false, error: 'cross-origin requests are not allowed' }, 403, corsOrigin)

  const client = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const now = Date.now()
  const record = failures.get(client)
  if (record && record.until > now) {
    return json({ ok: false, error: 'too many attempts, try again in a minute' }, 429, corsOrigin)
  }

  let pin
  try {
    const body = JSON.parse(await request.text())
    pin = body?.pin
  } catch {
    return json({ ok: false, error: 'body must be JSON' }, 400, corsOrigin)
  }
  if (typeof pin !== 'string' || pin.length === 0 || pin.length > 128) {
    return json({ ok: false, error: 'pin is required' }, 400, corsOrigin)
  }

  if (!(await verifyPin(env, pin))) {
    const count = (record && record.until <= now && record.count >= MAX_FAILURES ? 0 : (record?.count ?? 0)) + 1
    failures.set(client, { count, until: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0 })
    await sleep(FAIL_DELAY_MS)
    return json({ ok: false, error: 'incorrect PIN' }, 401, corsOrigin)
  }
  failures.delete(client)
  const { token, expiresAt } = await issueToken(env, now)
  return json({ ok: true, token, expiresAt }, 200, corsOrigin)
}

async function handleRealDataset(request, env, corsOrigin) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method not allowed' }, 405, corsOrigin)
  if (!(await isRealSession(request, env))) return json({ ok: false, error: 'PIN session required' }, 401, corsOrigin)
  return json({ ok: true, dataset: realDataset }, 200, corsOrigin)
}

/* --------------------------------- Records ---------------------------------- */

async function handleApi(request, env, url, corsOrigin) {
  const mode = url.searchParams.get('mode') ?? ''
  if (!MODES.has(mode)) return json({ ok: false, error: 'mode must be "demo" or "real"' }, 400, corsOrigin)
  // Real records are as private as the real dataset: PIN session only.
  if (mode === 'real' && (request.method === 'GET' || request.method === 'PUT') && !(await isRealSession(request, env))) {
    return json({ ok: false, error: 'PIN session required' }, 401, corsOrigin)
  }
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
        if (url.pathname === '/api/session') return await handleSession(request, env, url, corsOrigin)
        if (url.pathname === '/api/real-dataset') return await handleRealDataset(request, env, corsOrigin)
        if (url.pathname !== '/api/records') return json({ ok: false, error: 'not found' }, 404, corsOrigin)
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
