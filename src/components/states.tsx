// AdensaOps shared UI states.
//
// Three cross-cutting states every data surface needs:
//
// 1. Skeleton  — shown while a lazy route chunk or (future) API call loads.
//    Keeps layout dimensions so the page never jumps when content lands.
// 2. EmptyState — "nothing here yet" with an optional action, used by lists,
//    tables and the notification inbox so an empty page never reads as broken.
// 3. ErrorBoundary — catches render crashes per route so one broken page
//    never blanks the whole console.

import { Component, type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

/* ------------------------------------------------------------------ Skeleton */

/** A single pulsing block. Sizes are Tailwind classes so callers control fit. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-track dark:bg-brand-900/50 ${className}`}
    />
  )
}

/**
 * Page-level placeholder: header bar, KPI row, content block. Rendered while
 * a lazy route chunk loads (Suspense fallback) or data is pending.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-5">
      <Skeleton className="h-7 w-52" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

/* ---------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-track text-ink-faint dark:bg-brand-900">
        <Icon size={20} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- ErrorBoundary */

interface EBProps {
  children: ReactNode
  /** Remounts the boundary (clears the error) when this changes — e.g. route. */
  resetKey?: string
}

interface EBState {
  error: Error | null
}

/**
 * Per-route crash guard. Kept deliberately small: a plain retry button plus
 * the technical message so a bug report has something to go on.
 */
export class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }

  componentDidUpdate(prev: EBProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="rounded-xl border border-line bg-surface p-6">
        <p className="text-sm font-semibold text-ink">This page could not be displayed</p>
        <p className="mt-1 text-xs text-ink-faint">
          The rest of AdensaOps is still running. Reload to try again.
        </p>
        <p className="mt-3 rounded-lg bg-canvas p-3 font-mono text-[11px] text-ink-soft">
          {this.state.error.message}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-4 cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
        >
          Try again
        </button>
      </div>
    )
  }
}
