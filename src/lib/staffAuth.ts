// Staff sessions for the app edition (the real platform). Each person signs
// in with their own email and password; the worker checks the password and
// returns a signed session plus the person's profile and role. The session is
// kept in this browser (localStorage) until it expires (12 hours) or the
// person signs out; the worker re-checks it on every request.

import type { Dataset } from './dataSource'
import type { Role, StaffUser } from './permissions'
import { apiRequest } from './remote'

const SESSION_KEY = 'adensa.staffSession'

interface StoredSession {
  token: string
  expiresAt: number
  user: StaffUser
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (typeof s?.token !== 'string' || typeof s.expiresAt !== 'number' || !s.user) return null
    return s.expiresAt > Date.now() ? s : null
  } catch {
    return null
  }
}

function saveSession(s: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* storage blocked: the session lasts for this page only */
  }
}

export function getStaffToken(): string | null {
  return readSession()?.token ?? null
}

export function getStaffUser(): StaffUser | null {
  return readSession()?.user ?? null
}

export function isSignedIn(): boolean {
  return readSession() !== null
}

export function signOut(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

const auth = (): Record<string, string> => {
  const token = getStaffToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const res = await apiRequest(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...auth(), ...(init.headers as Record<string, string>) },
  })
  if (!res) return { ok: false, status: 0, error: 'The server is unreachable. Try again shortly.' }
  let body: (T & { ok?: boolean; error?: string }) | null = null
  try {
    body = (await res.json()) as T & { ok?: boolean; error?: string }
  } catch {
    body = null
  }
  if (!res.ok || !body?.ok) {
    if (res.status === 401 && path !== '/api/auth/login') signOut()
    return { ok: false, status: res.status, error: body?.error ?? 'Something went wrong.' }
  }
  return { ok: true, data: body }
}

export type SignInResult = { ok: true; user: StaffUser } | { ok: false; message: string }

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const r = await call<{ token: string; expiresAt: number; user: StaffUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) {
    return {
      ok: false,
      message:
        r.status === 401 || r.status === 400
          ? 'Incorrect email or password.'
          : r.status === 429
            ? 'Too many attempts. Try again in 15 minutes.'
            : r.status === 503
              ? 'Sign-in is not set up yet.'
              : r.error,
    }
  }
  saveSession({ token: r.data.token, expiresAt: r.data.expiresAt, user: r.data.user })
  return { ok: true, user: r.data.user }
}

/** Re-read the profile (role or name may have changed); signs out if the account is gone. */
export async function refreshUser(): Promise<StaffUser | null> {
  const s = readSession()
  if (!s) return null
  const r = await call<{ user: StaffUser }>('/api/auth/me')
  if (!r.ok) return r.status === 0 ? s.user : null
  saveSession({ ...s, user: r.data.user })
  return r.data.user
}

export async function changePassword(current: string, next: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await call<{ token: string; expiresAt: number; user: StaffUser }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ current, next }),
  })
  if (!r.ok) return { ok: false, message: r.error.charAt(0).toUpperCase() + r.error.slice(1) + '.' }
  saveSession({ token: r.data.token, expiresAt: r.data.expiresAt, user: r.data.user })
  return { ok: true }
}

/** The real dataset for a signed-in person; null if signed out or offline. */
export async function fetchRealDataset(): Promise<Dataset | null> {
  if (!isSignedIn()) return null
  const r = await call<{ dataset: Dataset }>('/api/real-dataset')
  return r.ok ? r.data.dataset : null
}

/* ------------------------------ Team (Product Lead) ------------------------------ */

export async function listStaff(): Promise<StaffUser[] | null> {
  const r = await call<{ staff: StaffUser[] }>('/api/staff')
  return r.ok ? r.data.staff : null
}

export async function createStaff(input: {
  email: string
  name: string
  role: Role
  password: string
}): Promise<{ ok: true; user: StaffUser } | { ok: false; message: string }> {
  const r = await call<{ user: StaffUser }>('/api/staff', { method: 'POST', body: JSON.stringify(input) })
  return r.ok ? { ok: true, user: r.data.user } : { ok: false, message: r.error.charAt(0).toUpperCase() + r.error.slice(1) + '.' }
}

export async function updateStaff(
  id: string,
  patch: Partial<{ name: string; role: Role; active: boolean; password: string }>,
): Promise<{ ok: true; user: StaffUser } | { ok: false; message: string }> {
  const r = await call<{ user: StaffUser }>(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return r.ok ? { ok: true, user: r.data.user } : { ok: false, message: r.error.charAt(0).toUpperCase() + r.error.slice(1) + '.' }
}
