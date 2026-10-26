import { useEffect, useMemo, useState } from 'react'
import type { DataTableColumn } from '../components/dataTable'
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
import { DataTable } from '../components/dataTable'
import type { Supplier } from '../types'
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
  // Mini-stats and the map reflect the rows on the current page, exactly as
  // the previous table's paginated slice did.
  const [visibleRows, setVisibleRows] = useState<Supplier[]>([])

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
  const matching = useMemo(
    () =>
      data.suppliers.filter(
        (s) =>
          (filter === 'all' || s.category === filter) &&
          (!q ||
            s.name.toLowerCase().includes(q) ||
            s.location.toLowerCase().includes(q) ||
            s.city.toLowerCase().includes(q) ||
            (s.contactPerson ?? '').toLowerCase().includes(q) ||
            (s.phone ?? '').includes(query.trim())),
      ),
    [data.suppliers, filter, q, query],
  )

  const priceCount = (id: string) => data.prices.filter((pr) => pr.supplierId === id).length

  const columns = useMemo<DataTableColumn<Supplier>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (s) => s.name,
        header: 'Supplier',
        enableSorting: true,
      },
      {
        id: 'category',
        accessorFn: (s) => s.category,
        header: 'Category',
        enableSorting: true,
      },
      {
        id: 'location',
        accessorFn: (s) => `${s.city} ${s.location}`,
        header: 'Location',
        enableSorting: true,
      },
      {
        id: 'contact',
        header: 'Contact',
        enableSorting: false,
      },
      {
        id: 'status',
        accessorFn: (s) => s.status,
        header: 'Status',
        enableSorting: true,
      },
      {
        id: 'reliability',
        accessorFn: (s) => s.reliability,
        header: 'Reliability',
        enableSorting: true,
        sortFn: (a, b) => {
          // Undefined reliability (not yet rated) always sorts last, as before.
          const av = a.original.reliability
          const bv = b.original.reliability
          if (av == null && bv == null) return 0
          if (av == null) return 1
          if (bv == null) return -1
          return av - bv
        },
      },
      {
        id: 'prices',
        accessorFn: (s) => priceCount(s.id),
        header: 'Prices captured',
        enableSorting: true,
        cell: (info) => priceCount((info.row.original as Supplier).id),
      },
    ],
    // priceCount is stable for a given dataset; recomputed when data changes.
    // priceCount closes over data.prices; recompute columns when prices change.
    [data.prices],
  )

  function renderCell(s: Supplier, columnId: string): React.ReactNode {
    switch (columnId) {
      case 'name':
        return (
          <div>
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
          </div>
        )
      case 'category':
        return <CategoryChip category={s.category} />
      case 'location':
        return (
          <div className="flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0 text-ink-faint" />
            <div>
              {s.location}
              <div className="text-[11px] text-ink-faint">{s.city}</div>
            </div>
          </div>
        )
      case 'contact':
        return s.phone ?? s.whatsapp ?? <span className="text-ink-faint">not captured yet</span>
      case 'status':
        return <StatusChip status={s.status} />
      case 'reliability':
        return s.reliability ? (
          <span className="flex items-center gap-0.5" title={`${s.reliability}/5`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                size={13}
                className={i < s.reliability! ? 'fill-warning text-warning' : 'text-track'}
              />
            ))}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">
            {s.status === 'vetted' ? 'Not rated' : 'earned through orders'}
          </span>
        )
      case 'prices': {
        const prices = data.prices.filter((p) => p.supplierId === s.id)
        const stale = prices.some((p) => isPriceStale(p))
        if (prices.length === 0) return <span className="text-ink-faint">awaiting first quote</span>
        return (
          <span>
            {prices.length}
            {stale && (
              <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                stale
              </span>
            )}
          </span>
        )
      }
      default:
        return null
    }
  }

  const pipelineCounts = STATUSES.map((st) => ({
    label: STATUS_LABELS[st],
    value: visibleRows.filter((s) => s.status === st).length,
    color: STATUS_COLORS[st],
  }))

  const categoryBars = CATEGORIES.map((cat) => ({
    label: CATEGORY_SHORT[cat],
    value: visibleRows.filter((s) => s.category === cat).length,
    color: CATEGORY_COLORS[cat],
  }))

  const staleCount = data.prices.filter((p) => isPriceStale(p)).length
  const freshnessSlices: DonutSlice[] = [
    { name: 'Fresh', value: data.prices.length - staleCount, color: 'var(--color-stage-ordered)' },
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
        <SupplierMap suppliers={visibleRows} height={340} />
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

      <DataTable
        columns={columns}
        data={matching}
        getRowId={(s) => s.id}
        renderCell={renderCell}
        noun="Suppliers"
        onVisibleRows={setVisibleRows}
        containerClassName="max-h-[70vh] overflow-y-auto"
        tableClassName={TABLE_MIN_W}
        emptyMessage={q ? `No suppliers match “${query.trim()}”.` : 'No suppliers in this category yet.'}
      />
    </div>
  )
}
