// AdensaOps toast system.
//
// One discreet stack, bottom-right, aria-live so screen readers announce
// confirmations. Every mutation in the console confirms through here, so the
// operator never wonders whether an action landed. Destructive-adjacent
// actions (status changes) can attach a single undo callback.
//
// Copy rules from AGENTS.md apply: short, factual, no dashes in prose.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
}

interface ToastApi {
  success: (message: string, action?: ToastAction) => void
  info: (message: string, action?: ToastAction) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TOAST_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone, action?: ToastAction) => {
      const id = nextId.current++
      setItems((prev) => [...prev.slice(-2), { id, message, tone, action }])
      window.setTimeout(() => dismiss(id), TOAST_MS)
    },
    [dismiss],
  )

  const api = useRef<ToastApi>({
    success: (message, action) => push(message, 'success', action),
    info: (message, action) => push(message, 'info', action),
  })
  // Keep the ref's push fresh across renders.
  api.current.success = (message, action) => push(message, 'success', action)
  api.current.info = (message, action) => push(message, 'info', action)

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {/* Live region: polite, never steals focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-lg shadow-brand-950/10 dark:border-line-strong dark:bg-subtle"
          >
            {t.tone === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Info size={16} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                  className="mt-1 cursor-pointer text-xs font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="cursor-pointer rounded p-0.5 text-ink-faint transition hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
