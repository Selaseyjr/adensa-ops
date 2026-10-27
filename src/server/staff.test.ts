// @vitest-environment node
// Staff accounts, sessions and roles, end to end through the worker, against
// a real SQLite database (node:sqlite behind a D1-compatible adapter).

import { describe, expect, it, vi } from 'vitest'
import worker from '../../worker.js'
import { hashPassword, issueStaffToken, readStaffToken, verifyPassword } from '../../server/staff.js'
import { createD1 } from '../test/d1.js'

const SECRET = 'test-session-secret-0123456789abcdef'
const ASSETS = { fetch: vi.fn(async () => new Response('asset')) }

/** A database with one Product Lead (and optionally more staff). */
async function setup() {
  const DB = createD1()
  const env = { DB, ASSETS, SESSION_SECRET: SECRET }
  const req = async (path: string, init: RequestInit & { token?: string; ip?: string } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string>) }
    if (init.token) headers.authorization = `Bearer ${init.token}`
    headers['cf-connecting-ip'] = init.ip ?? `203.0.113.${Math.floor(Math.random() * 250)}`
    return worker.fetch(new Request(`https://ops.example.com${path}`, { ...init, headers }), env as never)
  }
  // First call creates the schema; then seed the Product Lead like `npm run staff:add` would.
  await req('/api/auth/me')
  const stamp = new Date().toISOString()
  await DB.prepare(
    'INSERT INTO staff (id, email, name, role, password_hash, token_version, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?, ?)',
  )
    .bind('lead-1', 'lead@adensa.test', 'Ama Lead', 'product_lead', await hashPassword('lead-password-1'), stamp, stamp)
    .run()
  const login = async (email: string, password: string) => {
    const res = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    return { status: res.status, body: (await res.json()) as { token: string; user: { role: string; mustChangePassword: boolean } } }
  }
  const lead = (await login('lead@adensa.test', 'lead-password-1')).body.token
  return { DB, env, req, login, lead }
}

describe('passwords and tokens', () => {
  it('hashes with PBKDF2 within the Workers iteration cap and verifies', async () => {
    const h = await hashPassword('correct horse battery')
    expect(h).toMatch(/^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
    expect(await verifyPassword('correct horse battery', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })

  it('rejects tampered, foreign and expired tokens', async () => {
    const env = { SESSION_SECRET: SECRET }
    const { token } = await issueStaffToken(env, { id: 's1', token_version: 1 })
    expect(await readStaffToken(env, token)).toMatchObject({ sub: 's1', ver: 1 })
    expect(await readStaffToken({ SESSION_SECRET: 'another-secret-0123456789abcdefgh' }, token)).toBeNull()
    expect(await readStaffToken(env, token.replace(/.$/, (c) => (c === '0' ? '1' : '0')))).toBeNull()
    const old = await issueStaffToken(env, { id: 's1', token_version: 1 }, Date.now() - 13 * 3_600_000)
    expect(await readStaffToken(env, old.token)).toBeNull()
  })
})

describe('sign-in', () => {
  it('is not configured without SESSION_SECRET', async () => {
    const res = await worker.fetch(
      new Request('https://ops.example.com/api/auth/login', { method: 'POST', body: '{}' }),
      { DB: createD1(), ASSETS } as never,
    )
    expect(res.status).toBe(503)
  })

  it('accepts the right password only, and identifies the person and role', async () => {
    const { login, req } = await setup()
    expect((await login('lead@adensa.test', 'nope-nope-nope')).status).toBe(401)
    expect((await login('nobody@adensa.test', 'lead-password-1')).status).toBe(401)
    const ok = await login('  LEAD@adensa.test ', 'lead-password-1')
    expect(ok.status).toBe(200)
    const me = await req('/api/auth/me', { token: ok.body.token })
    expect(await me.json()).toMatchObject({ user: { name: 'Ama Lead', role: 'product_lead' } })
  })

  it('locks an address + email out after repeated wrong passwords', async () => {
    const { req } = await setup()
    const attempt = (password: string) =>
      req('/api/auth/login', { method: 'POST', ip: '198.51.100.7', body: JSON.stringify({ email: 'lead@adensa.test', password }) })
    for (let i = 0; i < 5; i++) expect((await attempt(`wrong-${i}`)).status).toBe(401)
    expect((await attempt('lead-password-1')).status).toBe(429)
  }, 20_000)

  it('rejects cross-origin sign-in attempts', async () => {
    const { req } = await setup()
    const res = await req('/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'lead@adensa.test', password: 'lead-password-1' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('team management (Product Lead only)', () => {
  it('creates staff for each role; new staff must change their password', async () => {
    const { req, lead, login } = await setup()
    for (const [email, role] of [
      ['ops@adensa.test', 'operations_manager'],
      ['sec@adensa.test', 'secretary'],
    ]) {
      const res = await req('/api/staff', {
        method: 'POST',
        token: lead,
        body: JSON.stringify({ email, name: role, role, password: 'temporary-pass-1' }),
      })
      expect(res.status).toBe(201)
    }
    const sec = await login('sec@adensa.test', 'temporary-pass-1')
    expect(sec.body.user).toMatchObject({ role: 'secretary', mustChangePassword: true })
    const list = (await (await req('/api/staff', { token: lead })).json()) as { staff: { email: string }[] }
    expect(list.staff.map((s) => s.email)).toEqual(['lead@adensa.test', 'ops@adensa.test', 'sec@adensa.test'])
    expect(JSON.stringify(list)).not.toContain('pbkdf2')
  })

  it('refuses team management to other roles, bad input and duplicates', async () => {
    const { req, lead, login } = await setup()
    await req('/api/staff', {
      method: 'POST',
      token: lead,
      body: JSON.stringify({ email: 'sec@adensa.test', name: 'Sec', role: 'secretary', password: 'temporary-pass-1' }),
    })
    const sec = (await login('sec@adensa.test', 'temporary-pass-1')).body.token
    expect((await req('/api/staff', { token: sec })).status).toBe(403)
    const bad = (body: object) => req('/api/staff', { method: 'POST', token: lead, body: JSON.stringify(body) })
    expect((await bad({ email: 'x@adensa.test', name: 'X', role: 'owner', password: 'temporary-pass-1' })).status).toBe(400)
    expect((await bad({ email: 'x@adensa.test', name: 'X', role: 'secretary', password: 'short' })).status).toBe(400)
    expect((await bad({ email: 'not-an-email', name: 'X', role: 'secretary', password: 'temporary-pass-1' })).status).toBe(400)
    expect((await bad({ email: 'sec@adensa.test', name: 'X', role: 'secretary', password: 'temporary-pass-1' })).status).toBe(409)
  })

  it('deactivating, changing role or resetting a password signs that person out at once', async () => {
    const { req, lead, login } = await setup()
    const created = (await (
      await req('/api/staff', {
        method: 'POST',
        token: lead,
        body: JSON.stringify({ email: 'ops@adensa.test', name: 'Ops', role: 'operations_manager', password: 'temporary-pass-1' }),
      })
    ).json()) as { user: { id: string } }
    const id = created.user.id
    const patch = (body: object) => req(`/api/staff/${id}`, { method: 'PATCH', token: lead, body: JSON.stringify(body) })

    let ops = (await login('ops@adensa.test', 'temporary-pass-1')).body.token
    expect((await patch({ role: 'secretary' })).status).toBe(200)
    expect((await req('/api/auth/me', { token: ops })).status).toBe(401)

    ops = (await login('ops@adensa.test', 'temporary-pass-1')).body.token
    expect((await patch({ password: 'reset-password-2' })).status).toBe(200)
    expect((await req('/api/auth/me', { token: ops })).status).toBe(401)

    ops = (await login('ops@adensa.test', 'reset-password-2')).body.token
    expect((await patch({ active: false })).status).toBe(200)
    expect((await req('/api/auth/me', { token: ops })).status).toBe(401)
    expect((await login('ops@adensa.test', 'reset-password-2')).status).toBe(401)
  })

  it('always keeps one active Product Lead', async () => {
    const { req, lead } = await setup()
    const res = await req('/api/staff/lead-1', { method: 'PATCH', token: lead, body: JSON.stringify({ active: false }) })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/product lead/)
  })
})

describe('own password', () => {
  it('changes the password, clears the first-login flag and signs out other sessions', async () => {
    const { req, lead, login } = await setup()
    const other = (await login('lead@adensa.test', 'lead-password-1')).body.token
    expect(
      (await req('/api/auth/password', { method: 'POST', token: lead, body: JSON.stringify({ current: 'bad', next: 'new-password-123' }) })).status,
    ).toBe(400)
    const res = await req('/api/auth/password', {
      method: 'POST',
      token: lead,
      body: JSON.stringify({ current: 'lead-password-1', next: 'new-password-123' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; user: { mustChangePassword: boolean } }
    expect(body.user.mustChangePassword).toBe(false)
    expect((await req('/api/auth/me', { token: body.token })).status).toBe(200)
    expect((await req('/api/auth/me', { token: other })).status).toBe(401)
    expect((await login('lead@adensa.test', 'new-password-123')).status).toBe(200)
  })
})

describe('real data requires a staff session', () => {
  it('serves the real dataset and real records to staff only', async () => {
    const { req, lead, DB } = await setup()
    expect((await req('/api/real-dataset')).status).toBe(401)
    expect((await req('/api/real-dataset', { token: lead })).status).toBe(503) // not seeded yet
    await DB.prepare("INSERT INTO datasets (name, payload, updated_at) VALUES ('real', ?, ?)")
      .bind(JSON.stringify({ suppliers: [{ id: 'sup-x' }] }), new Date().toISOString())
      .run()
    const ds = (await (await req('/api/real-dataset', { token: lead })).json()) as { dataset: { suppliers: unknown[] } }
    expect(ds.dataset.suppliers).toEqual([{ id: 'sup-x' }])

    expect((await req('/api/records?mode=real')).status).toBe(401)
    const put = await req('/api/records?mode=real', { method: 'PUT', token: lead, body: JSON.stringify({ quotes: [{ id: 'QT-1' }] }) })
    expect(put.status).toBe(200)
    const got = (await (await req('/api/records?mode=real', { token: lead })).json()) as { records: { quotes: unknown[] } }
    expect(got.records.quotes).toHaveLength(1)
  })
})
