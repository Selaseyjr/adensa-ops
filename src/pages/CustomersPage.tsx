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
import { Pager, SortableTh, paginate, sortRows, useSort, type SortState } from '../components/table'
import {
  CATEGORIES,
  CategoryChip,
  FollowUpCell,
  TABLE_MIN_W,
} from './shared'

export function CustomersPage({ data }: { data: Dataset }) {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const { sort, toggle } = useSort<'name' | 'type' | 'city' | 'followUp'>()
  const [page, setPage] = useState(0)

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
  const sorted = sortRows(
    matching,
    sort as SortState | null,
    (c) =>
      sort?.key === 'name'
        ? c.name
        : sort?.key === 'type'
          ? c.type
          : sort?.key === 'city'
            ? c.city
            : c.nextFollowUp ?? '9999-12-31',
  )
  const visibleCustomers = paginate(sorted, page)
  const typeSlices: DonutSlice[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of data.customers) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
    return [...counts.entries()].map(([type, value]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value,
      color: CUSTOMER_TYPE_COLORS[type] ?? '#60a5fa',
    }))
  }, [data])

  // Keep the pager on page 0 whenever the result set changes shape.
  useEffect(() => {
    setPage(0)
  }, [query])

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
                  cursor={{ fill: 'rgba(96, 165, 250, 0.12)' }}
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

      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className={`w-full text-left text-sm ${TABLE_MIN_W}`}>
          <thead className="sticky top-0 z-10 border-b border-line bg-subtle text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <SortableTh label="Customer" sortKey="name" sort={sort} onToggle={toggle} />
              <SortableTh label="Type" sortKey="type" sort={sort} onToggle={toggle} />
              <SortableTh label="City" sortKey="city" sort={sort} onToggle={toggle} />
              <th className="px-4 py-3 text-left">Products needed</th>
              <SortableTh label="Next follow-up" sortKey="followUp" sort={sort} onToggle={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visibleCustomers.map((c) => (
              <tr key={c.id} className="transition hover:bg-subtle">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{
                        backgroundColor: CUSTOMER_TYPE_COLORS[c.type] ?? '#60a5fa',
                      }}
                    >
                      {c.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{c.name}</div>
                      {c.contactPerson && (
                        <div className="text-[11px] text-ink-faint">{c.contactPerson}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-ink-soft">{c.type}</td>
                <td className="px-4 py-3 text-ink-soft">{c.city}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.productsNeeded.map((p) => (
                      <CategoryChip key={p} category={p} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <FollowUpCell date={c.nextFollowUp} />
                </td>
              </tr>
            ))}
            {visibleCustomers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-faint">
                  {q ? `No customers match “${query.trim()}”.` : 'No customer records yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager page={page} total={sorted.length} onPage={setPage} noun="Customers" />
      </div>
    </div>
  )
}

