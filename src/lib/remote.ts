// Remote record sync — local-first bridge between localStorage and a
// D1-backed /api/records endpoint.
//
// Contract:
// - The UI never waits on the network. localStorage is the render source of
//   truth; the remote copy is merged in when it arrives and pushed back after
//   every local commit (debounced).
// - Requests try the same-origin API first. Production builds (the Vercel
//   frontend, which serves the SPA without a worker) then fall back to the
//   shared D1 worker, so both deployments read and write the SAME database
//   and records sync across devices everywhere. In dev/tests there is no
//   fallback: same-origin only, exactly today's behaviour.
// - Any failure (offline, 404, D1 hiccup) degrades to today's behaviour:
//   records live in this browser only.
// - Demo and real records sync to separate server rows, preserving the
//   isolation guarantee across devices.
// - Server wins on conflicts inside a single record? No: LOCAL wins — the
//   device you are typing on is authoritative for its own edits; arrays are
//   unioned by id so records created on another device still arrive.

import type { DataMode } from './dataSource'
import type { LocalRecords } from './localData'
import { mergeRecords as mergeFn } from './localData'

const API = '/api/records'

// Shared worker holding the production D1 database. Only consulted when the
// same-origin API is absent (the Vercel build) and only in production builds —
// local dev and the test suite never reach it.
const SHARED_API = 'https://site-a4b300eaf34c4cf8b3615bd8246771d6.freebuff.page/api/records'

/** Debounce window for pushes so rapid edits collapse into one write. */
const PUSH_DEBOUNCE_MS = 800

function defaultSharedBase(): string {
  return import.meta.env.PROD ? SHARED_API : ''
}

/** Base URL that last answered with API JSON, so later calls skip the dead host. */
let workingBase: string | null = null

/** Candidate API bases, most-likely-first (remembered winner up front). */
function bases(sharedBase: string): string[] {
  const list = [API]
  if (sharedBase && sharedBase !== API) list.push(sharedBase)
  if (workingBase) {
    const idx = list.indexOf(workingBase)
    if (idx > 0) {
      list.splice(idx, 1)
      list.unshift(workingBase)
    }
  }
  return list
}

/** True when the response is the worker's API (not an SPA HTML fallback). */
function isApiJson(res: Response): boolean {
  const type = res.headers.get('content-type') ?? ''
  return res.ok && type.includes('application/json')
}

/** GET the server copy, or null when there is no usable backend. */
export async function fetchRemoteRecords(
  mode: DataMode,
  sharedBase: string = defaultSharedBase(),
): Promise<LocalRecords | null> {
  if (typeof fetch !== 'function') return null
  for (const base of bases(sharedBase)) {
    try {
      const res = await fetch(`${base}?mode=${mode}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      // A host without the worker API serves index.html (200 HTML) or 404 —
      // both mean "not this host", so try the next candidate base.
      if (!isApiJson(res)) continue
      const body = (await res.json()) as { ok?: boolean; records?: LocalRecords | null }
      if (!body || body.ok !== true) continue
      workingBase = base
      if (!body.records || typeof body.records !== 'object') return null
      return body.records
    } catch {
      continue
    }
  }
  return null
}

/** PUT the local copy. Returns false when there is no backend (not an error). */
export async function pushRecords(
  mode: DataMode,
  records: LocalRecords,
  sharedBase: string = defaultSharedBase(),
): Promise<boolean> {
  if (typeof fetch !== 'function') return false
  for (const base of bases(sharedBase)) {
    try {
      const res = await fetch(`${base}?mode=${mode}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(records),
      })
      if (!isApiJson(res)) continue
      const body = (await res.json()) as { ok?: boolean }
      if (body?.ok === true) {
        workingBase = base
        return true
      }
    } catch {
      continue
    }
  }
  return false
}

/**
 * Pull-merge-push once at startup/mode-switch: returns the records to render
 * (local merged with remote) and syncs the union back so both copies converge.
 */
export async function hydrateRecords(
  mode: DataMode,
  local: LocalRecords,
  apply: (merged: LocalRecords) => void,
  sharedBase: string = defaultSharedBase(),
): Promise<LocalRecords> {
  const remote = await fetchRemoteRecords(mode, sharedBase)
  if (!remote) return local
  const merged = mergeFn(local, remote)
  apply(merged)
  await pushRecords(mode, merged, sharedBase)
  return merged
}

/** Debounced push: N edits in a burst produce one write. */
export function createPushQueue(
  mode: DataMode,
  sharedBase: string = defaultSharedBase(),
): (records: LocalRecords) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: LocalRecords | null = null
  return (records) => {
    pending = records
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const payload = pending
      pending = null
      if (payload) void pushRecords(mode, payload, sharedBase)
    }, PUSH_DEBOUNCE_MS)
  }
}
