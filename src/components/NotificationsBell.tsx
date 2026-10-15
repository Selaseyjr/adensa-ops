import { useEffect, useRef } from 'react'
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  PackageCheck,
  RotateCcw,
  Tag,
  Truck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  formatWhen,
  type AppNotification,
  type NotificationKind,
  type NotificationState,
  type NotificationTarget,
} from '../lib/notifications'

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  supplier: Truck,
  price: Tag,
  quote: CheckCheck,
  order: PackageCheck,
  delivery: Truck,
  inquiry: Users,
}

const KIND_LABEL: Record<NotificationKind, string> = {
  supplier: 'Supplier',
  price: 'Price update',
  quote: 'Quotation',
  order: 'Order',
  delivery: 'Delivery',
  inquiry: 'Customer inquiry',
}

/**
 * Notification bell — top-right of the header.
 *
 * Demo mode shows the simulated feed; real mode receives an empty list and
 * renders the empty state (no simulated data on the real page).
 * Unread items carry a blue dot + tinted row; every item can be toggled
 * read/unread, the last bulk action can be undone once, and clicking a row
 * opens the sidebar tab that notification belongs to.
 */
export function NotificationsBell({
  items,
  state,
  onNavigate,
  /** Controlled open state so "Let's get started" can open the panel. */
  open,
  setOpen,
  emptyNote,
}: {
  items: AppNotification[]
  state: NotificationState
  onNavigate: (target: NotificationTarget) => void
  open: boolean
  setOpen: (open: boolean) => void
  /** Extra line in the empty state (real-data mode explains where live events come from). */
  emptyNote?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const unread = items.filter((i) => !state.isRead(i.id))

  // Close on outside click / Escape; return focus to the bell on close.
  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        bellRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  function openItem(n: AppNotification) {
    if (!state.isRead(n.id)) state.markOne(n.id, true)
    setOpen(false)
    onNavigate(n.target)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={bellRef}
        onClick={() => setOpen(!open)}
        aria-label={
          unread.length > 0
            ? `Notifications, ${unread.length} unread`
            : 'Notifications, none unread'
        }
        aria-expanded={open}
        aria-haspopup="true"
        title="Notifications"
        className={`relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border transition ${
          open
            ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
            : 'border-line-strong bg-surface text-ink-soft hover:bg-subtle hover:text-ink'
        }`}
      >
        <Bell size={16} />
        {unread.length > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,400px)] overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Notifications</h2>
              {unread.length > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unread.length} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {state.undoLabel && (
                <button
                  onClick={state.undo}
                  title={`Undo: ${state.undoLabel}`}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-soft transition hover:bg-subtle hover:text-ink"
                >
                  <RotateCcw size={12} />
                  Undo
                </button>
              )}
              {unread.length > 0 && (
                <button
                  onClick={state.markAllRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/60"
                >
                  <CheckCheck size={12} />
                  Read all
                </button>
              )}
            </div>
          </div>

          {/* List / empty state */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-ink-faint">
                <BellOff size={20} />
              </div>
              <p className="mt-3 text-sm font-medium text-ink">You're all caught up</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                New updates will appear here as they happen.
              </p>
              {emptyNote && (
                <p className="mt-2 rounded-lg bg-subtle px-3 py-1.5 text-[11px] leading-relaxed text-ink-faint">
                  {emptyNote}
                </p>
              )}
            </div>
          ) : (
            <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind]
                const isRead = state.isRead(n.id)
                return (
                  <li
                    key={n.id}
                    className={`group relative border-b border-line last:border-b-0 ${
                      isRead ? '' : 'bg-brand-50/60 dark:bg-brand-950/30'
                    }`}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isRead
                            ? 'bg-subtle text-ink-faint'
                            : 'bg-brand-100 text-brand-700 dark:bg-brand-950/70 dark:text-brand-300'
                        }`}
                        title={KIND_LABEL[n.kind]}
                      >
                        <Icon size={15} />
                      </span>
                      {/* Clicking the body opens the relevant tab */}
                      <button
                        onClick={() => openItem(n)}
                        className="min-w-0 flex-1 text-left"
                        title={`Open ${n.target}`}
                      >
                        <div className="flex items-center gap-2">
                          {!isRead && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600"
                              aria-label="Unread"
                            />
                          )}
                          <span
                            className={`truncate text-[13px] ${
                              isRead ? 'font-medium text-ink-soft' : 'font-semibold text-ink'
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] text-ink-faint">
                            {formatWhen(n.minutesAgo)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                          {n.message}
                        </p>
                        <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                          {KIND_LABEL[n.kind]}
                        </span>
                      </button>
                      {/* Per-item read toggle — standard mail-style control */}
                      <button
                        onClick={() => state.markOne(n.id, !isRead)}
                        title={isRead ? 'Mark as unread' : 'Mark as read'}
                        aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                        className={`mt-0.5 shrink-0 rounded-md p-1 transition ${
                          isRead
                            ? 'text-ink-faint hover:bg-subtle hover:text-ink'
                            : 'text-brand-600 hover:bg-brand-100 dark:text-brand-400 dark:hover:bg-brand-950/60'
                        }`}
                      >
                        {isRead ? <X size={13} /> : <Check size={13} />}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-line bg-subtle px-4 py-2 text-[11px] text-ink-faint">
              {items.length} notifications · {unread.length} unread
            </div>
          )}
        </div>
      )}
    </div>
  )
}
