// AdensaOps table chrome: sortable headers, sticky header support, pagination.
//
// Shared by the Suppliers and Customers tables. Sorting cycles
// asc -> desc -> unsorted; aria-sort exposes the state to screen readers.
// Pagination keeps long lists scannable (10 rows per page) and resets
// gracefully when filters shrink the result set.

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

export interface SortState<K extends string = string> {
  key: K
  dir: SortDir
}

/** Cycle: unsorted -> asc -> desc -> unsorted. */
export function useSort<K extends string>() {
  const [sort, setSort] = useState<SortState<K> | null>(null)
  function toggle(key: K) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }
  return { sort, toggle }
}

/**
 * Sort an array by a reader function. Strings compare case-insensitively,
 * numbers numerically, undefined always last regardless of direction.
 */
export function sortRows<T>(
  rows: T[],
  sort: SortState | null,
  read: (row: T) => string | number | undefined,
): T[] {
  if (!sort) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = read(a)
    const vb = read(b)
    if (va === undefined && vb === undefined) return 0
    if (va === undefined) return 1
    if (vb === undefined) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * dir
  })
}

/** Header cell that toggles sort on click and reports state via aria-sort. */
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onToggle,
  align = 'left',
}: {
  label: string
  sortKey: K
  sort: SortState<K> | null
  onToggle: (key: K) => void
  align?: 'left' | 'right'
}) {
  const active = sort?.key === sortKey
  return (
    <th
      scope="col"
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex cursor-pointer items-center gap-1 uppercase tracking-wide transition hover:text-ink ${
          active ? 'text-ink' : ''
        }`}
      >
        {label}
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`transition ${active ? 'opacity-100' : 'opacity-30'} ${
            active && sort!.dir === 'asc' ? 'rotate-180' : ''
          }`}
        />
      </button>
    </th>
  )
}

const PAGE_SIZE = 10

/** Slice to the current page, clamping when filters shrink the list. */
export function paginate<T>(rows: T[], page: number): T[] {
  return rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
}

/** Prev/next pager with a summary line; hidden when everything fits. */
export function Pager({
  page,
  total,
  onPage,
  noun,
}: {
  page: number
  total: number
  onPage: (page: number) => void
  noun: string
}): ReactNode {
  const pageCount = Math.ceil(total / PAGE_SIZE)
  if (pageCount <= 1) return null
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  const clamp = (n: number) => Math.max(0, Math.min(n, pageCount - 1))
  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-faint"
      aria-label={`${noun} pages`}
    >
      <span>
        {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(clamp(page - 1))}
          disabled={page === 0}
          aria-label="Previous page"
          className="cursor-pointer rounded-md border border-line-strong p-1.5 transition enabled:hover:bg-subtle disabled:cursor-default disabled:opacity-40"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPage(clamp(page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
          className="cursor-pointer rounded-md border border-line-strong p-1.5 transition enabled:hover:bg-subtle disabled:cursor-default disabled:opacity-40"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
