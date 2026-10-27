// The two editions of AdensaOps, built from one codebase:
//
//   demo  public portfolio demo (demo.adensaops.com): synthetic data and the
//         live simulation only. No backend calls, no PIN, no real records.
//   app   the real platform (app.adensaops.com / adensaops.com): real data
//         from the API after sign-in. No demo seed or simulation.
//
// `VITE_EDITION` picks one at build time and the `@edition` import alias
// (vite.config.ts) points at its module, so each bundle contains only its
// own edition's data code. An unset variable builds the demo: nothing
// private can ship by accident.

import type { ComponentType } from 'react'
import type { DataMode, Dataset } from '../lib/dataSource'
import type { LocalRecords } from '../lib/localData'
import type { AppNotification } from '../lib/notifications'
import type { StaffUser } from '../lib/permissions'

export type EditionName = 'demo' | 'app'

export type DataStatus = 'ready' | 'loading' | 'error'

export interface EditionData {
  /** Seed dataset merged under the operator's records (and the simulation, in demo). */
  dataset: Dataset
  status: DataStatus
  /** Notifications for the bell (simulated in demo, never in app). */
  notifications: AppNotification[]
}

export interface Edition {
  name: EditionName
  /** Data mode this edition runs in (records, ids and storage keys follow it). */
  mode: DataMode
  /** Full-page sign-in shown before the shell (app edition only). */
  SignIn: ComponentType<{ onSignedIn: () => void }> | null
  /** Forced password change after signing in with a temporary password. */
  FirstPassword: ComponentType<{ name: string; onDone: () => void }> | null
  /** Password change form for the account menu. */
  ChangePassword: ComponentType<{ onDone: () => void; onCancel: () => void }> | null
  /** Team management page (Product Lead, app edition). */
  TeamPage: ComponentType<{ me: StaffUser }> | null
  /** The signed-in person (demo: a fixed visitor with full access); null when signed out. */
  currentUser(): StaffUser | null
  /** Re-read the person's profile from the server (role changes apply at once). */
  refreshUser(): Promise<StaffUser | null>
  /** End the session (app edition); the demo has none. */
  signOut(): void
  /** Shows the portfolio presentation (About panel, author footer). */
  showcase: boolean
  useEditionData(local: LocalRecords): EditionData
  /** Merge server records into local ones (app edition); demo stays in the browser. */
  hydrate(local: LocalRecords, apply: (merged: LocalRecords) => void): void
  /** Debounced push of local records to the server (no-op in demo). */
  createPush(): (records: LocalRecords) => void
}
