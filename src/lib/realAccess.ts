// Real-mode access. The PIN is verified by the worker (POST /api/session),
// never in the browser, and the real dataset is fetched from the API with the
// signed session token (GET /api/real-dataset). Nothing private ships in the
// JS bundle. The token is kept per tab (sessionStorage), so a refresh keeps
// working but a new tab or a fresh visitor always meets the PIN gate.

import type { Dataset } from './dataSource'
import { apiRequest } from './remote'

const SESSION_KEY = 'adensa.realSession'

interface StoredSession {
  token: string
  expiresAt: number
}

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (typeof s?.token !== 'string' || typeof s.expiresAt !== 'number') return null
    return s.expiresAt > Date.now() ? s : null
  } catch {
    return null
  }
}

/** The signed session token, or null when Real mode is locked or expired. */
export function getRealToken(): string | null {
  return readSession()?.token ?? null
}

export function isRealUnlocked(): boolean {
  return readSession() !== null
}

export function lockReal(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export type UnlockResult = 'ok' | 'wrong' | 'locked' | 'unavailable'

/** Ask the worker to verify the PIN; stores the session token on success. */
export async function unlockReal(pin: string): Promise<UnlockResult> {
  if (!pin) return 'wrong'
  const res = await apiRequest('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!res) return 'unavailable'
  if (res.status === 429) return 'locked'
  if (!res.ok) return res.status === 401 || res.status === 400 ? 'wrong' : 'unavailable'
  try {
    const body = (await res.json()) as { ok?: boolean; token?: string; expiresAt?: number }
    if (!body.ok || typeof body.token !== 'string' || typeof body.expiresAt !== 'number') return 'unavailable'
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: body.token, expiresAt: body.expiresAt }))
    } catch {
      return 'unavailable'
    }
    return 'ok'
  } catch {
    return 'unavailable'
  }
}

/** The real dataset for an unlocked session; null if locked, expired or offline. */
export async function fetchRealDataset(): Promise<Dataset | null> {
  const token = getRealToken()
  if (!token) return null
  const res = await apiRequest('/api/real-dataset', { headers: { authorization: `Bearer ${token}` } })
  if (!res) return null
  if (res.status === 401) {
    lockReal()
    return null
  }
  if (!res.ok) return null
  try {
    const body = (await res.json()) as { ok?: boolean; dataset?: Dataset }
    return body.ok && body.dataset ? body.dataset : null
  } catch {
    return null
  }
}
