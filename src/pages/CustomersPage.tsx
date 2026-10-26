import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Search } from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import {
  CATEGORY_COLORS,
  CATEGORY_SHORT,
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
  CUSTOMER_TYPE_COLORS,
} from '../lib/colors'
import {
  ChartCard,
  DonutChart,
  type DonutSlice,
} from '../components/charts'
import type { DataTableColumn } from '../components/dataTable'
import { DataTable } from '../components/dataTable'
import type { Customer } from '../types'
import {
  CATEGORIES,
  CategoryChip,
  FollowUpCell,
  TABLE_MIN_W,
} from './shared'

export function CustomersPage({ data }: { data: Dataset }) {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')

  // Keep the box in sync when ?q= arrives from the palette or a shared link.
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
  const matching = data.customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.contactPerson ?? '').toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(query.trim()),
  )
  // Column definitions for the DataTable. Sorting keys mirror the old table:
  // Name/type/city/follow-up are sortable; productsNeeded is not (as before).
  const columns = useMemo<DataTableColumn<Customer>[]>(
    () => [
      { id: 'name', accessorFn: (c) => c.name, header: 'Customer', enableSorting: true },
      { id: 'type', accessorFn: (c) => c.type, header: 'Type', enableSorting: true },
      { id: 'city', accessorFn: (c) => c.city, header: 'City', enableSorting: true },
      { id: 'productsNeeded', header: 'Products needed', enableSorting: false },
      {
        id: 'followUp',
        accessorFn: (c) => c.nextFollowUp ?? '9999-12-31',
        header: 'Next follow-up',
        enableSorting: true,
      },
    ],
    [],
  )

  function renderCell(c: Customer, columnId: string): React.ReactNode {
    switch (columnId) {
      case 'name':
        return (
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: CUSTOMER_TYPE_COLORS[c.type] ?? 'var(--color-brand-500)' }}
            >
              {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </span>
            <div className="min-w-0">
              <div className="font-medium text-ink">{c.name}</div>
              {c.contactPerson && <div className="text-[11px] text-ink-faint">{c.contactPerson}</div>}
            </div>
          </div>
        )
      case 'type':
        return <span className="capitalize text-ink-soft">{c.type}</span>
      case 'city':
        return <span className="text-ink-soft">{c.city}</span>
      case 'productsNeeded':
        return (
          <div className="flex flex-wrap gap-1">
            {c.productsNeeded.map((p) => (
              <CategoryChip key={p} category={p} />
            ))}
          </div>
        )
      case 'followUp':
        return <FollowUpCell date={c.nextFollowUp} />
      default:
        return null
    }
  }

  const typeSlices: DonutSlice[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of data.customers) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
    return [...counts.entries()].map(([type, value]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value,
      color: CUSTOMER_TYPE_COLORS[type] ?? 'var(--color-brand-500)',
    }))
  }, [data])

  const demandBars = CATEGORIES.map((cat) => ({
    label: CATEGORY_SHORT[cat],
    value: data.customers.filter((c) => c.productsNeeded.includes(cat)).length,
    color: CATEGORY_COLORS[cat],
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Customer mix" sub="By customer type">
          <DonutChart data={typeSlices} centerLabel="customers" />
        </ChartCard>
        <ChartCard
          title="Demand by category"
          sub="How many customers need each category"
          className="lg:col-span-2"
        >
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={demandBars} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  axisLine={{ stroke: CHART_GRID }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'var(--color-subtle)' }}
                  formatter={(value) => [`${value} customer${Number(value) === 1 ? '' : 's'}`, 'Need']}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {demandBars.map((d) => (
                    <Cell key={d.label} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="flex items-center gap-2">
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
            placeholder="Search customers…"
            aria-label="Search customers"
            className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={matching}
        getRowId={(c) => c.id}
        renderCell={renderCell}
        noun="Customers"
        containerClassName="max-h-[70vh] overflow-y-auto"
        tableClassName={TABLE_MIN_W}
        emptyMessage={q ? `No customers match “${query.trim()}”.` : 'No customer records yet.'}
      />
    </div>
  )
}

