import { useCallback, useEffect, useState } from 'react'

/** Where a notification sends the user — same keys as the sidebar NavKey. */
export type NotificationTarget =
  | 'dashboard'
  | 'suppliers'
  | 'customers'
  | 'compare'
  | 'quotes'
  | 'orders'
  | 'cash'

export type NotificationKind = 'supplier' | 'price' | 'quote' | 'order' | 'delivery' | 'inquiry'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  message: string
  /** How long before "now" this happened. Demo stamps stay relative however old the session is. */
  minutesAgo: number
  /** Sidebar tab this notification belongs to — clicking it opens that tab. */
  target: NotificationTarget
  /** Seed state: some demo items start already read, so both states are visible. */
  initiallyRead?: boolean
}

/** "6m ago" · "3h ago" · "Yesterday" · weekday date — standard inbox phrasing. */
export function formatWhen(minutesAgo: number): string {
  if (minutesAgo < 1) return 'Just now'
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}m ago`
  if (minutesAgo < 60 * 24) return `${Math.round(minutesAgo / 60)}h ago`
  if (minutesAgo < 60 * 48) return 'Yesterday'
  const d = new Date(Date.now() - minutesAgo * 60_000)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export interface NotificationState {
  isRead: (id: string) => boolean
  unreadCount: number
  /** Toggle one item; records an undo step. */
  markOne: (id: string, read: boolean) => void
  /** Read everything; records an undo step. */
  markAllRead: () => void
  /** Single-level undo of the last read/unread action. */
  undo: () => void
  /** Label of the action that can be undone, or null when nothing to undo. */
  undoLabel: string | null
}

/**
 * Read/unread bookkeeping for the notification bell.
 *
 * Demo mode seeds from `initiallyRead`; real mode passes an empty list — no
 * simulated items are ever mixed into the real page (per the privacy rule).
 * State is session-only: read flags are ephemeral, not operational records.
 */
export function useNotifications(items: AppNotification[]): NotificationState {
  const [readIds, setReadIds] = useState<string[]>(() =>
    items.filter((i) => i.initiallyRead).map((i) => i.id),
  )
  const [prev, setPrev] = useState<{ ids: string[]; label: string } | null>(null)

  // A new feed (Demo <-> Real switch) invalidates the pending undo step, so an
  // empty real-mode panel can never show an Undo button with nothing to undo.
  useEffect(() => {
    setPrev(null)
  }, [items])

  const markOne = useCallback(
    (id: string, read: boolean) => {
      const isRead = readIds.includes(id)
      if (read === isRead) return
      setPrev({ ids: readIds, label: read ? 'Marked as read' : 'Marked as unread' })
      setReadIds(read ? [...readIds, id] : readIds.filter((x) => x !== id))
    },
    [readIds],
  )

  const markAllRead = useCallback(() => {
    const unread = items.filter((i) => !readIds.includes(i.id))
    if (unread.length === 0) return
    setPrev({ ids: readIds, label: `Marked ${unread.length} as read` })
    setReadIds(items.map((i) => i.id))
  }, [items, readIds])

  const undo = useCallback(() => {
    if (!prev) return
    setReadIds(prev.ids)
    setPrev(null)
  }, [prev])

  return {
    isRead: (id: string) => readIds.includes(id),
    unreadCount: items.filter((i) => !readIds.includes(i.id)).length,
    markOne,
    markAllRead,
    undo,
    undoLabel: prev?.label ?? null,
  }
}
