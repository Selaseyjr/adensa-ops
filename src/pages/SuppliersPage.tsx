import { useEffect, useState } from 'react'
import { MapPin, Search, Star } from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import {
  ALERT_AMBER,
  CATEGORY_COLORS,
  CATEGORY_SHORT,
  STATUS_COLORS,
} from '../lib/colors'
import {
  ChartCard,
  CategoryBars,
  DonutChart,
  type DonutSlice,
} from '../components/charts'
import { SupplierMap } from '../components/SupplierMap'
import { Pager, SortableTh, paginate, sortRows, useSort, type SortState } from '../components/table'
import {
  PRICE_STALE_DAYS,
  STATUS_LABELS,
  isPriceStale,
  type Category,
} from '../types'
import {
  CATEGORIES,
  CategoryChip,
  FilterChip,
  MapLegend,
  STATUSES,
  StatusChip,
  TABLE_MIN_W,
} from './shared'

export function SuppliersPage({ data }: { data: Dataset }) {
  const [filter, setFilter] = useState<'all' | Category>('all')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const { sort, toggle } = useSort<'name' | 'category' | 'location' | 'status' | 'reliability' | 'prices'>()
  const [page, setPage] = useState(0)

  // The palette (and shared links) set ?q=; keep the box in sync with it.
  useEffect(() => {
    function sync() {
      setQuery(new URLSearchParams(window.location.search).get('q') ?? '')
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function typeInSearch(value: string) {
    setQuery(value)
    const url = new URL(window.location.href)
    if (value) url.searchParams.set('q', value)
    else url.searchParams.delete('q')
    window.history.replaceState(null, '', url)
  }

  const q = query.trim().toLowerCase()
  const matching = data.suppliers.filter(
    (s) =>
      (filter === 'all' || s.category === filter) &&
      (!q ||
        s.name.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        (s.contactPerson ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').includes(query.trim())),
  )
  const priceCount = (id: string) => data.prices.filter((pr) => pr.supplierId === id).length
  const sorted = sortRows(
    matching,
    sort as SortState | null,
    (s) =>
      sort?.key === 'name'
        ? s.name
        : sort?.key === 'category'
          ? s.category
          : sort?.key === 'location'
            ? `${s.city} ${s.location}`
            : sort?.key === 'status'
              ? s.status
              : sort?.key === 'reliability'
                ? s.reliability
                : priceCount(s.id),
  )
  const rows = paginate(sorted, page)

  const pipelineCounts = STATUSES.map((st) => ({
    label: STATUS_LABELS[st],
    value: rows.filter((s) => s.status === st).length,
    color: STATUS_COLORS[st],
  }))

  const categoryBars = CATEGORIES.map((cat) => ({
    label: CATEGORY_SHORT[cat],
    value: rows.filter((s) => s.category === cat).length,
    color: CATEGORY_COLORS[cat],
  }))

  // Keep the pager on page 0 whenever the result set changes shape.
  useEffect(() => {
    setPage(0)
  }, [filter, query])

  const staleCount = data.prices.filter((p) => isPriceStale(p)).length
  const freshnessSlices: DonutSlice[] = [
    { name: 'Fresh', value: data.prices.length - staleCount, color: '#2563eb' },
    { name: `Older than ${PRICE_STALE_DAYS} days`, value: staleCount, color: ALERT_AMBER },
  ]

  return (
    <div className="space-y-5">
      {/* Pipeline mini-stats — stacks on phones, three-up from sm */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {pipelineCounts.map((p) => (
          <div
            key={p.label}
            className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-ink-faint">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-ink">{p.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Suppliers by category" sub="Network breadth per product line">
          <CategoryBars data={categoryBars} />
        </ChartCard>
        <ChartCard title="Price freshness" sub={`${data.prices.length} price observations tracked`}>
          <DonutChart data={freshnessSlices} centerLabel="prices" />
        </ChartCard>
      </div>

      {/* Map */}
      <ChartCard title="Supplier map" sub="Filtered by category">
        <SupplierMap suppliers={rows} height={340} />
        <MapLegend />
      </ChartCard>

      {/* Search + filters + table */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => typeInSearch(e.target.value)}
            placeholder="Search suppliers…"
            aria-label="Search suppliers"
            className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${data.suppliers.length})`} />
        {CATEGORIES.map((cat) => {
          const n = data.suppliers.filter((s) => s.category === cat).length
          return (
            <FilterChip
              key={cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              label={`${CATEGORY_SHORT[cat]} (${n})`}
            />
          )
        })}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className={`w-full text-left text-sm ${TABLE_MIN_W}`}>
          <thead className="sticky top-0 z-10 border-b border-line bg-subtle text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <SortableTh label="Supplier" sortKey="name" sort={sort} onToggle={toggle} />
              <SortableTh label="Category" sortKey="category" sort={sort} onToggle={toggle} />
              <SortableTh label="Location" sortKey="location" sort={sort} onToggle={toggle} />
              <th className="px-4 py-3 text-left">Contact</th>
              <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggle} />
              <SortableTh label="Reliability" sortKey="reliability" sort={sort} onToggle={toggle} />
              <SortableTh label="Prices captured" sortKey="prices" sort={sort} onToggle={toggle} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => {
              const prices = data.prices.filter((p) => p.supplierId === s.id)
              const stale = prices.some((p) => isPriceStale(p))
              return (
                <tr key={s.id} className="transition hover:bg-subtle">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{s.name}</div>
                    {s.source && (
                      <a
                        href={s.source}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-600 hover:underline dark:text-brand-400"
                      >
                        source &#8599;
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryChip category={s.category} />
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    <div className="flex items-start gap-1.5">
                      <MapPin size={13} className="mt-0.5 shrink-0 text-ink-faint" />
                      <div>
                        {s.location}
                        <div className="text-[11px] text-ink-faint">{s.city}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {s.phone ?? s.whatsapp ?? <span className="text-ink-faint">not captured yet</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    {s.reliability ? (
                      <span className="flex items-center gap-0.5" title={`${s.reliability}/5`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            size={13}
                            className={
                              i < s.reliability! ? 'fill-amber-400 text-amber-400' : 'text-track'
                            }
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-faint">
                        {s.status === 'vetted' ? 'Not rated' : 'earned through orders'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft">
                    {prices.length === 0 ? (
                      <span className="text-ink-faint">awaiting first quote</span>
                    ) : (
                      <span>
                        {prices.length}
                        {stale && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            stale
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-faint">
                  {q ? `No suppliers match “${query.trim()}”.` : 'No suppliers in this category yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} total={sorted.length} onPage={setPage} noun="Suppliers" />
      </div>
    </div>
  )
}

