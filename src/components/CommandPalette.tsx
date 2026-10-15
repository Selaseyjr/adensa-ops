// AdensaOps command palette (Cmd/Ctrl+K, or "/").
//
// Search across navigation targets and the operator's own records: suppliers,
// customers and quotes. Selecting a record navigates to its page with ?q=
// prefilled, so the URL carries the search state and the view is shareable.
//
// Keyboard model: input keeps focus, ArrowUp/ArrowDown move a roving
// selection, Enter opens, Escape closes and returns focus to the trigger.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Search, Truck, Users } from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import type { NotificationTarget } from '../lib/notifications'
import { useFocusTrap } from '../lib/a11y'

interface PaletteEntry {
  id: string
  group: string
  label: string
  hint?: string
  run: () => void
}

interface PaletteResult {
  entry: PaletteEntry
  score: number
}

/** Subsequence match with adjacency bonus: cheap, order-preserving, fuzzy-ish. */
function score(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct === 0) return 1000
  if (direct > 0) return 500 - direct
  let ti = 0
  let hits = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return 0
    hits += 1
    ti = found + 1
  }
  return hits * 10
}

export function CommandPalette({
  open,
  onClose,
  data,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  data: Dataset
  onNavigate: (target: NotificationTarget) => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<PaletteEntry[]>(() => {
    const go = (target: NotificationTarget, q?: string): (() => void) => () => {
      onNavigate(target)
      if (q !== undefined) {
        // Defer so the page mounts before the param lands.
        window.setTimeout(() => {
          const url = new URL(window.location.href)
          if (q) url.searchParams.set('q', q)
          else url.searchParams.delete('q')
          window.history.replaceState(null, '', url)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, 0)
      }
      onClose()
    }

    const nav: PaletteEntry[] = [
      ['dashboard', 'Dashboard'],
      ['suppliers', 'Suppliers'],
      ['customers', 'Customers'],
      ['compare', 'Compare quotes'],
      ['quotes', 'Quote builder'],
      ['orders', 'Orders'],
      ['cash', 'Cash tracker'],
    ].map(([target, label]) => ({
      id: `nav-${target}`,
      group: 'Go to',
      label,
      run: go(target as NotificationTarget),
    }))

    const suppliers: PaletteEntry[] = data.suppliers.map((s) => ({
      id: `sup-${s.id}`,
      group: 'Suppliers',
      label: s.name,
      hint: `${s.city} · ${s.status}`,
      run: go('suppliers', s.name),
    }))

    const customers: PaletteEntry[] = data.customers.map((c) => ({
      id: `cus-${c.id}`,
      group: 'Customers',
      label: c.name,
      hint: `${c.city} · ${c.type}`,
      run: go('customers', c.name),
    }))

    const quotes: PaletteEntry[] = data.quotes.map((q) => ({
      id: `quo-${q.id}`,
      group: 'Quotes',
      label: `${q.id} · ${data.customers.find((c) => c.id === q.customerId)?.name ?? 'Customer'}`,
      hint: `GH₵${q.valueGhs.toLocaleString('en-GB')} · ${q.status}`,
      run: go('quotes'),
    }))

    return [...nav, ...suppliers, ...customers, ...quotes]
  }, [data, onClose, onNavigate])

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim()
    if (!q) return entries.slice(0, 12).map((entry) => ({ entry, score: 0 }))
    const scored: PaletteResult[] = []
    for (const entry of entries) {
      const s = Math.max(score(q, entry.label), score(q, entry.hint ?? '') * 0.5)
      if (s > 0) scored.push({ entry, score: s })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 12)
  }, [entries, query])

  // Reset on open; the focus trap moves focus in, keeps Tab inside and
  // returns focus to the trigger on close (Escape included).
  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])
  useFocusTrap(panelRef, open, onClose)

  // Keep the highlighted row visible.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[cursor]?.entry.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  let lastGroup = ''

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-brand-950/50 px-4 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Search AdensaOps"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl outline-none dark:border-line-strong"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search suppliers, customers, quotes…"
            aria-label="Search suppliers, customers and quotes"
            className="w-full bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint sm:block">
            esc
          </kbd>
        </div>
        <div ref={listRef} role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">No matches for “{query.trim()}”.</p>
          )}
          {results.map(({ entry }, idx) => {
            const showGroup = entry.group !== lastGroup
            lastGroup = entry.group
            const Icon =
              entry.group === 'Suppliers' ? Truck : entry.group === 'Customers' ? Users : entry.group === 'Quotes' ? FileText : Search
            return (
              <div key={entry.id}>
                {showGroup && (
                  <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    {entry.group}
                  </div>
                )}
                <button
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === cursor}
                  onMouseEnter={() => setCursor(idx)}
                  onClick={entry.run}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition ${
                    idx === cursor ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-subtle'
                  }`}
                >
                  <Icon size={15} className={`shrink-0 ${idx === cursor ? 'text-white' : 'text-ink-faint'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.label}</span>
                  {entry.hint && (
                    <span className={`shrink-0 text-xs ${idx === cursor ? 'text-white/80' : 'text-ink-faint'}`}>
                      {entry.hint}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
