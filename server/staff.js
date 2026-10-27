// Staff accounts and sessions for the app edition (the real platform).
//
// Every person signs in with their own email + password. Accounts live in D1
// (table `staff`); passwords are stored as PBKDF2-SHA256 hashes. A session is
// an HMAC-signed token carrying the staff id and a token version; every
// request re-reads the account, so deactivating someone, changing their role
// or resetting their password takes effect immediately.
//
// Roles (the business's three positions):
//   product_lead        everything, plus managing the team
//   operations_manager  all operations, including money and cash
//   secretary           customers, quotes, orders (view) and delivery receipts
//
// Endpoints (wired in worker.js):
//   POST  /api/auth/login     { email, password }  -> { token, expiresAt, user }
//   GET   /api/auth/me                             -> { user }
//   POST  /api/auth/password  { current, next }    -> { token, expiresAt, user }
//   GET   /api/staff                (product lead) -> { staff: [...] }
//   POST  /api/staff                (product lead) { email, name, role, password }
//   PATCH /api/staff/:id            (product lead) { name?, role?, active?, password? }

export const ROLES = ['product_lead', 'operations_manager', 'secretary']
export const PASSWORD_ITERATIONS = 100_000 // Workers cap PBKDF2 at 100k iterations
export const MIN_PASSWORD_LENGTH = 10
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

const MAX_FAILURES = 5
const LOCKOUT_MS = 15 * 60 * 1000
const FAIL_DELAY_MS = 400
/** Failed sign-ins per address + email (best effort, per isolate). */
const failures = new Map()

const enc = new TextEncoder()

/* --------------------------------- helpers --------------------------------- */

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function b64url(str) {
  return btoa(String.fromCharCode(...enc.encode(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromB64url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Constant-time comparison of two strings. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function normaliseEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200
}

/* --------------------------------- passwords -------------------------------- */

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(bits)
}

/** "pbkdf2$<iterations>$<salt hex>$<hash hex>", the same format scripts/staff.mjs writes. */
export async function hashPassword(password, iterations = PASSWORD_ITERATIONS) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  return `pbkdf2$${iterations}$${salt}$${await pbkdf2(password, salt, iterations)}`
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : []
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PASSWORD_ITERATIONS) return false
  return safeEqual(await pbkdf2(password, parts[2], iterations), parts[3])
}

// Burned on unknown emails so a miss takes as long as a wrong password.
const DUMMY_HASH = `pbkdf2$${PASSWORD_ITERATIONS}$00000000000000000000000000000000$${'0'.repeat(64)}`

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (password.length > 200) return 'password is too long'
  return null
}

/* --------------------------------- sessions --------------------------------- */

function sessionSecret(env) {
  const s = env?.SESSION_SECRET
  return typeof s === 'string' && s.length >= 32 ? s : null
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** Signed token: v1.<payload>.<signature>; payload = { sub, ver, exp }. */
export async function issueStaffToken(env, staff, now = Date.now()) {
  const secret = sessionSecret(env)
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const expiresAt = now + SESSION_TTL_MS
  const body = `v1.${b64url(JSON.stringify({ sub: staff.id, ver: staff.token_version, exp: expiresAt }))}`
  return { token: `${body}.${await hmac(secret, body)}`, expiresAt }
}

/** Token claims when the signature and expiry check out; null otherwise. */
export async function readStaffToken(env, token, now = Date.now()) {
  const secret = sessionSecret(env)
  if (!secret || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  if (!safeEqual(parts[2], await hmac(secret, `${parts[0]}.${parts[1]}`))) return null
  try {
    const claims = JSON.parse(fromB64url(parts[1]))
    if (typeof claims.sub !== 'string' || !Number.isInteger(claims.ver) || !(claims.exp > now)) return null
    return claims
  } catch {
    return null
  }
}

/* ---------------------------------- storage --------------------------------- */

export const STAFF_SCHEMA =
  'CREATE TABLE IF NOT EXISTS staff (' +
  'id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, ' +
  'password_hash TEXT NOT NULL, token_version INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, ' +
  'must_change_password INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'

const COLUMNS = 'id, email, name, role, password_hash, token_version, active, must_change_password, created_at, updated_at'

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active === 1 || row.active === true,
    mustChangePassword: row.must_change_password === 1 || row.must_change_password === true,
  }
}

async function findByEmail(db, email) {
  return db.prepare(`SELECT ${COLUMNS} FROM staff WHERE email = ?`).bind(email).first()
}

async function findById(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM staff WHERE id = ?`).bind(id).first()
}

/** The signed-in, active staff member for this request, or null. */
export async function currentStaff(request, env) {
  if (!env?.DB) return null
  const h = request.headers.get('authorization') ?? ''
  const claims = await readStaffToken(env, h.startsWith('Bearer ') ? h.slice(7).trim() : null)
  if (!claims) return null
  const row = await findById(env.DB, claims.sub)
  if (!row || !(row.active === 1 || row.active === true) || row.token_version !== claims.ver) return null
  return row
}

/* --------------------------------- handlers --------------------------------- */

async function readJson(request) {
  try {
    const body = JSON.parse(await request.text())
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/**
 * All /api/auth/* and /api/staff* routes. `json(body, status)` is the
 * worker's response helper (it adds CORS and no-store headers).
 */
export async function handleStaffApi(request, env, url, json) {
  if (!sessionSecret(env)) return json({ ok: false, error: 'sign-in is not configured' }, 503)
  if (!env?.DB) return json({ ok: false, error: 'database unavailable' }, 503)
  const db = env.DB
  const path = url.pathname

  if (path === '/api/auth/login') {
    if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
    const body = await readJson(request)
    const email = normaliseEmail(body?.email)
    const password = body?.password
    if (!email || typeof password !== 'string' || password.length === 0 || password.length > 200) {
      return json({ ok: false, error: 'email and password are required' }, 400)
    }
    const key = `${request.headers.get('cf-connecting-ip') ?? 'unknown'}|${email}`
    const now = Date.now()
    const record = failures.get(key)
    if (record && record.until > now) return json({ ok: false, error: 'too many attempts, try again later' }, 429)

    const row = await findByEmail(db, email)
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH)
    if (!row || !ok || !(row.active === 1 || row.active === true)) {
      const count = (record && record.until <= now && record.count >= MAX_FAILURES ? 0 : (record?.count ?? 0)) + 1
      failures.set(key, { count, until: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0 })
      await sleep(FAIL_DELAY_MS)
      return json({ ok: false, error: 'incorrect email or password' }, 401)
    }
    failures.delete(key)
    const { token, expiresAt } = await issueStaffToken(env, row, now)
    return json({ ok: true, token, expiresAt, user: publicUser(row) })
  }

  const me = await currentStaff(request, env)
  if (!me) return json({ ok: false, error: 'sign-in required' }, 401)

  if (path === '/api/auth/me') {
    if (request.method !== 'GET') return json({ ok: false, error: 'method not allowed' }, 405)
    return json({ ok: true, user: publicUser(me) })
  }

  if (path === '/api/auth/password') {
    if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
    const body = await readJson(request)
    if (!(await verifyPassword(body?.current ?? '', me.password_hash))) {
      await sleep(FAIL_DELAY_MS)
      return json({ ok: false, error: 'current password is incorrect' }, 400)
    }
    const problem = passwordProblem(body?.next)
    if (problem) return json({ ok: false, error: problem }, 400)
    if (body.next === body.current) return json({ ok: false, error: 'choose a new password' }, 400)
    // A new password signs every other session out (token version bump).
    const updated = { ...me, password_hash: await hashPassword(body.next), token_version: me.token_version + 1 }
    await db
      .prepare('UPDATE staff SET password_hash = ?, token_version = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
      .bind(updated.password_hash, updated.token_version, new Date().toISOString(), me.id)
      .run()
    const { token, expiresAt } = await issueStaffToken(env, updated)
    return json({ ok: true, token, expiresAt, user: { ...publicUser(updated), mustChangePassword: false } })
  }

  // ---- Team management: Product Lead only ----
  if (path === '/api/staff' || path.startsWith('/api/staff/')) {
    if (me.role !== 'product_lead') return json({ ok: false, error: 'product lead only' }, 403)

    if (path === '/api/staff' && request.method === 'GET') {
      const { results } = await db.prepare(`SELECT ${COLUMNS} FROM staff ORDER BY created_at`).all()
      return json({ ok: true, staff: (results ?? []).map(publicUser) })
    }

    if (path === '/api/staff' && request.method === 'POST') {
      const body = await readJson(request)
      const email = normaliseEmail(body?.email)
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      if (!validEmail(email)) return json({ ok: false, error: 'a valid email is required' }, 400)
      if (!name || name.length > 120) return json({ ok: false, error: 'name is required' }, 400)
      if (!ROLES.includes(body?.role)) return json({ ok: false, error: 'unknown role' }, 400)
      const problem = passwordProblem(body?.password)
      if (problem) return json({ ok: false, error: problem }, 400)
      if (await findByEmail(db, email)) return json({ ok: false, error: 'that email already has an account' }, 409)
      const stamp = new Date().toISOString()
      const row = {
        id: crypto.randomUUID(),
        email,
        name,
        role: body.role,
        password_hash: await hashPassword(body.password),
        token_version: 1,
        active: 1,
        must_change_password: 1,
        created_at: stamp,
        updated_at: stamp,
      }
      await db
        .prepare(`INSERT INTO staff (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(row.id, row.email, row.name, row.role, row.password_hash, row.token_version, row.active, row.must_change_password, row.created_at, row.updated_at)
        .run()
      return json({ ok: true, user: publicUser(row) }, 201)
    }

    const id = path.slice('/api/staff/'.length)
    if (id && request.method === 'PATCH') {
      const target = await findById(db, id)
      if (!target) return json({ ok: false, error: 'not found' }, 404)
      const body = (await readJson(request)) ?? {}
      const next = { ...target }
      let signOut = false
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name || name.length > 120) return json({ ok: false, error: 'name is required' }, 400)
        next.name = name
      }
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) return json({ ok: false, error: 'unknown role' }, 400)
        signOut ||= body.role !== target.role
        next.role = body.role
      }
      if (body.active !== undefined) {
        next.active = body.active ? 1 : 0
        signOut ||= !body.active
      }
      if (body.password !== undefined) {
        const problem = passwordProblem(body.password)
        if (problem) return json({ ok: false, error: problem }, 400)
        next.password_hash = await hashPassword(body.password)
        next.must_change_password = 1
        signOut = true
      }
      // The business must always keep one active Product Lead.
      const losingLead = target.role === 'product_lead' && (next.role !== 'product_lead' || !next.active)
      if (losingLead) {
        const { results } = await db.prepare(`SELECT ${COLUMNS} FROM staff WHERE role = 'product_lead' AND active = 1`).all()
        if ((results ?? []).filter((r) => r.id !== target.id).length === 0) {
          return json({ ok: false, error: 'keep at least one active product lead' }, 400)
        }
      }
      if (signOut) next.token_version = target.token_version + 1
      await db
        .prepare(
          'UPDATE staff SET name = ?, role = ?, active = ?, password_hash = ?, must_change_password = ?, token_version = ?, updated_at = ? WHERE id = ?',
        )
        .bind(next.name, next.role, next.active, next.password_hash, next.must_change_password, next.token_version, new Date().toISOString(), id)
        .run()
      return json({ ok: true, user: publicUser(next) })
    }

    return json({ ok: false, error: 'method not allowed' }, 405)
  }

  return json({ ok: false, error: 'not found' }, 404)
}
