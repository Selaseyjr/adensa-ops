// Remote record sync — local-first bridge between localStorage and the
// worker's D1-backed /api/records endpoint.
//
// Contract:
// - The UI never waits on the network. localStorage is the render source of
//   truth; the remote copy is merged in when it arrives and pushed back after
//   every local commit (debounced).
// - Any failure (no backend on Vercel, offline, 404, D1 hiccup) degrades to
//   today's behaviour: records live in this browser only.
// - Demo and real records sync to separate server rows, preserving the
//   isolation guarantee across devices.
// - Server wins on conflicts inside a single record? No: LOCAL wins — the
//   device you are typing on is authoritative for its own edits; arrays are
//   unioned by id so records created on another device still arrive.

import type { DataMode } from './dataSource'
import type { LocalRecords } from './localData'
import { mergeRecords as mergeFn } from './localData'

const API = '/api/records'
/** Debounce window for pushes so rapid edits collapse into one write. */
const PUSH_DEBOUNCE_MS = 800

/** GET the server copy, or null when there is no usable backend. */
export async function fetchRemoteRecords(mode: DataMode): Promise<LocalRecords | null> {
  if (typeof fetch !== 'function') return null
  try {
    const res = await fetch(`${API}?mode=${mode}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    // Static hosting without the worker API serves index.html (200 HTML) or
    // 404 for /api/* — both mean "no backend", not an error worth showing.
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('application/json')) return null
    const body = (await res.json()) as { ok?: boolean; records?: LocalRecords | null }
    if (!body || body.ok !== true || !body.records || typeof body.records !== 'object') return null
    return body.records
  } catch {
    return null
  }
}

/** PUT the local copy. Returns false when there is no backend (not an error). */
export async function pushRecords(mode: DataMode, records: LocalRecords): Promise<boolean> {
  if (typeof fetch !== 'function') return false
  try {
    const res = await fetch(`${API}?mode=${mode}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(records),
    })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('application/json')) return false
    const body = (await res.json()) as { ok?: boolean }
    return body?.ok === true
  } catch {
    return false
  }
}

/**
 * Pull-merge-push once at startup/mode-switch: returns the records to render
 * (local merged with remote) and syncs the union back so both copies converge.
 */
export async function hydrateRecords(
  mode: DataMode,
  local: LocalRecords,
  apply: (merged: LocalRecords) => void,
): Promise<LocalRecords> {
  const remote = await fetchRemoteRecords(mode)
  if (!remote) return local
  const merged = mergeFn(local, remote)
  apply(merged)
  await pushRecords(mode, merged)
  return merged
}

/** Debounced push: N edits in a burst produce one write. */
export function createPushQueue(mode: DataMode): (records: LocalRecords) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: LocalRecords | null = null
  return (records) => {
    pending = records
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const payload = pending
      pending = null
      if (payload) void pushRecords(mode, payload)
    }, PUSH_DEBOUNCE_MS)
  }
}
