import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Factory,
  MapPin,
  PackageSearch,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { DataMode, Dataset } from './lib/dataSource'
import {
  CATEGORY_COLORS,
  CATEGORY_SHORT,
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
  CUSTOMER_TYPE_COLORS,
  STATUS_COLORS,
} from './lib/colors'
import { ChartCard, CategoryBars, DonutChart, type DonutSlice } from './components/charts'
import { SupplierMap } from './components/SupplierMap'
import {
  CATEGORY_LABELS,
  PRICE_STALE_DAYS,
  STATUS_LABELS,
  daysSince,
  isPriceStale,
  type Category,
  type ProspectStatus,
} from './types'

const CATEGORIES: Category[] = ['cement', 'plumbing', 'electrical', 'safety', 'tools']
const STATUSES: ProspectStatus[] = ['identified', 'contacted', 'vetted']

function ghs(n: number): string {
  return `GH¢${n.toLocaleString('en-GH')}`
}

function StatusChip({ status }: { status: ProspectStatus }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}12`,
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function CategoryChip({ category }: { category: Category }) {
  const color = CATEGORY_COLORS[category]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, backgroundColor: `${color}14` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {CATEGORY_SHORT[category]}
    </span>
  )
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  alert,
}: {
  icon: LucideIcon
  tone: string
  label: string
  value: string | number
  sub?: string
  alert?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className={`mt-1 text-2xl font-bold ${alert ? 'text-rose-600' : 'text-slate-900'}`}>
            {value}
          </div>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${tone}16`, color: tone }}
        >
          <Icon size={18} />
        </div>
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function MapLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {CATEGORIES.map((cat) => (
        <span key={cat} className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS[cat] }}
          />
          {CATEGORY_LABELS[cat]}
        </span>
      ))}
      <span className="ml-auto text-[10px] text-slate-400">
        Approximate area positions &middot; &copy; OpenStreetMap
      </span>
    </div>
  )
}

/* ---------------------------------- Dashboard --------------------------------- */

export function DashboardPage({ data, mode }: { data: Dataset; mode: DataMode }) {
  const vetted = data.suppliers.filter((s) => s.status === 'vetted').length
  const staleCount = data.prices.filter((p) => isPriceStale(p)).length
  const freshCount = data.prices.length - staleCount
  const quotedCount = data.prices.filter((p) => p.type === 'quoted').length
  const referenceCount = data.prices.length - quotedCount
  const coveredProducts = data.products.filter((p) =>
    data.prices.some((pr) => pr.productId === p.id && pr.type === 'quoted'),
  ).length

  const pipelineSlices: DonutSlice[] = STATUSES.map((st) => ({
    name: STATUS_LABELS[st],
    value: data.suppliers.filter((s) => s.status === st).length,
    color: STATUS_COLORS[st],
  }))

  const freshnessSlices: DonutSlice[] = [
    { name: 'Fresh', value: freshCount, color: '#059669' },
    { name: `Older than ${PRICE_STALE_DAYS} days`, value: staleCount, color: '#f59e0b' },
  ]

  const categoryBars = CATEGORIES.map((cat) => ({
    label: CATEGORY_SHORT[cat],
    value: data.suppliers.filter((s) => s.category === cat).length,
    color: CATEGORY_COLORS[cat],
  }))

  // Price observations captured per day — quoted vs market reference.
  const timeline = useMemo(() => {
    const byDate = new Map<string, { quoted: number; reference: number }>()
    for (const p of data.prices) {
      const entry = byDate.get(p.capturedOn) ?? { quoted: 0, reference: 0 }
      if (p.type === 'quoted') entry.quoted += 1
      else entry.reference += 1
      byDate.set(p.capturedOn, entry)
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))
  }, [data])

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Factory}
          tone="#4f46e5"
          label="Suppliers"
          value={data.suppliers.length}
          sub={`${vetted} vetted · ${data.suppliers.length - vetted} in pipeline`}
        />
        <StatCard
          icon={Users}
          tone="#0284c7"
          label="Customers"
          value={data.customers.length}
          sub="From discovery research"
        />
        <StatCard
          icon={Tag}
          tone="#059669"
          label="Quoted prices"
          value={quotedCount}
          sub={
            mode === 'real'
              ? 'Awaiting first supplier calls'
              : `${coveredProducts}/${data.products.length} products covered`
          }
        />
        <StatCard
          icon={AlertTriangle}
          tone="#f59e0b"
          label="Stale prices"
          value={staleCount}
          sub={`Older than ${PRICE_STALE_DAYS} days — refresh before quoting`}
          alert={staleCount > 0}
        />
      </div>

      {/* Charts row: pipeline / categories / freshness */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Supplier pipeline" sub="Identified → contacted → vetted">
          <DonutChart data={pipelineSlices} centerLabel="suppliers" />
        </ChartCard>
        <ChartCard title="Suppliers by category" sub="Network breadth per product line">
          <CategoryBars data={categoryBars} />
        </ChartCard>
        <ChartCard
          title="Price freshness"
          sub={`${data.prices.length} price observations tracked`}
        >
          <DonutChart data={freshnessSlices} centerLabel="prices" />
        </ChartCard>
      </div>

      {/* Capture timeline */}
      <ChartCard
        title="Price capture activity"
        sub="Observations captured per day — supplier quotes vs market references"
      >
        {timeline.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs text-slate-400">
            No price observations yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gradQuoted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradRef" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                axisLine={{ stroke: CHART_GRID }}
                tickLine={false}
                tickFormatter={(v: string) =>
                  new Date(`${v}T00:00:00`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })
                }
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
                labelFormatter={(label) =>
                  new Date(`${label}T00:00:00`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                }
              />
              <Area
                type="monotone"
                dataKey="quoted"
                name="Quoted prices"
                stackId="1"
                stroke="#0284c7"
                strokeWidth={2}
                fill="url(#gradQuoted)"
              />
              <Area
                type="monotone"
                dataKey="reference"
                name="Market references"
                stackId="1"
                stroke="#d97706"
                strokeWidth={2}
                fill="url(#gradRef)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Map + coverage */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="Supplier network"
          sub="Where the pipeline sits across Ghana"
          className="lg:col-span-2"
        >
          <SupplierMap suppliers={data.suppliers} height={330} />
          <MapLegend />
        </ChartCard>
        <ChartCard
          title="Category coverage"
          sub="Products with at least one quoted price"
        >
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const total = data.products.filter((p) => p.category === cat).length
              const covered = data.products.filter(
                (p) =>
                  p.category === cat &&
                  data.prices.some((pr) => pr.productId === p.id && pr.type === 'quoted'),
              ).length
              const pct = total === 0 ? 0 : Math.round((covered / total) * 100)
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-slate-500">
                      {covered}/{total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                    />
                  </div>
                </div>
              )
            })}
            <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
              {mode === 'real'
                ? 'Coverage fills as supplier quotes are captured during onboarding calls.'
                : `${data.products.length - coveredProducts} product(s) still without a demo quote.`}
            </p>
          </div>
        </ChartCard>
      </div>

      {/* Reference observations strip */}
      {referenceCount > 0 && (
        <ChartCard
          title="Market reference observations"
          sub="Dated observations used to sanity-check supplier quotes"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.prices
              .filter((p) => p.type === 'market_reference')
              .map((p, i) => {
                const product = data.products.find((pr) => pr.id === p.productId)
                const stale = isPriceStale(p)
                return (
                  <div
                    key={`${p.productId}-${p.capturedOn}-${i}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-medium text-slate-800">
                        {product ? `${product.brand} — ${product.name}` : p.productId}
                      </div>
                      <div className="text-sm font-bold text-slate-900">{ghs(p.ghs)}</div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <CalendarClock size={12} />
                      {p.capturedOn}
                      {stale && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                          {daysSince(p.capturedOn)}d old
                        </span>
                      )}
                    </div>
                    {p.source && (
                      <div className="mt-1 truncate text-[11px] text-slate-400" title={p.source}>
                        {p.source}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </ChartCard>
      )}
    </div>
  )
}

/* --------------------------------- Suppliers ---------------------------------- */

export function SuppliersPage({ data }: { data: Dataset }) {
  const [filter, setFilter] = useState<'all' | Category>('all')

  const rows = data.suppliers.filter((s) => filter === 'all' || s.category === filter)

  const pipelineCounts = STATUSES.map((st) => ({
    label: STATUS_LABELS[st],
    value: rows.filter((s) => s.status === st).length,
    color: STATUS_COLORS[st],
  }))

  return (
    <div className="space-y-5">
      {/* Pipeline mini-stats */}
      <div className="grid grid-cols-3 gap-4">
        {pipelineCounts.map((p) => (
          <div
            key={p.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{p.value}</div>
          </div>
        ))}
      </div>

      {/* Map */}
      <ChartCard title="Supplier map" sub="Filtered by category — click a marker for details">
        <SupplierMap suppliers={rows} height={340} />
        <MapLegend />
      </ChartCard>

      {/* Filters + table */}
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reliability</th>
              <th className="px-4 py-3">Prices captured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => {
              const prices = data.prices.filter((p) => p.supplierId === s.id)
              const stale = prices.some((p) => isPriceStale(p))
              return (
                <tr key={s.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.name}</div>
                    {s.source && (
                      <a
                        href={s.source}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-sky-600 hover:underline"
                      >
                        source &#8599;
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryChip category={s.category} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-start gap-1.5">
                      <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />
                      <div>
                        {s.location}
                        <div className="text-[11px] text-slate-400">{s.city}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.phone ?? s.whatsapp ?? <span className="text-slate-400">not captured yet</span>}
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
                              i < s.reliability! ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                            }
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {s.status === 'vetted' ? '—' : 'earned through orders'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {prices.length === 0 ? (
                      <span className="text-slate-400">awaiting first quote</span>
                    ) : (
                      <span>
                        {prices.length}
                        {stale && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
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
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No suppliers in this category yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  )
}

/* --------------------------------- Customers ---------------------------------- */

export function CustomersPage({ data }: { data: Dataset }) {
  const typeSlices: DonutSlice[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of data.customers) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
    return [...counts.entries()].map(([type, value]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value,
      color: CUSTOMER_TYPE_COLORS[type] ?? '#64748b',
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
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                formatter={(value) => [`${value} customer${Number(value) === 1 ? '' : 's'}`, 'Need']}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                {demandBars.map((d) => (
                  <Cell key={d.label} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Products needed</th>
              <th className="px-4 py-3">Next follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.customers.map((c) => (
              <tr key={c.id} className="transition hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{
                        backgroundColor: CUSTOMER_TYPE_COLORS[c.type] ?? '#64748b',
                      }}
                    >
                      {c.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div>
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.contactPerson && (
                        <div className="text-[11px] text-slate-500">{c.contactPerson}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">{c.type}</td>
                <td className="px-4 py-3 text-slate-600">{c.city}</td>
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
            {data.customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No customer records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FollowUpCell({ date }: { date?: string }) {
  if (!date) return <span className="text-slate-400">—</span>
  const days = -daysSince(date)
  let chip = null
  if (days < 0) {
    chip = (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
        overdue
      </span>
    )
  } else if (days <= 7) {
    chip = (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        due in {days}d
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-700">{date}</span>
      {chip}
    </div>
  )
}

/* ------------------------------- Compare quotes ------------------------------- */

export function ComparePage({ data }: { data: Dataset }) {
  const productIdsWithQuotes = useMemo(() => {
    const ids = new Set(data.prices.filter((p) => p.type === 'quoted').map((p) => p.productId))
    return data.products.filter((p) => ids.has(p.id))
  }, [data])

  const [selected, setSelected] = useState<string>(productIdsWithQuotes[0]?.id ?? '')

  const product = data.products.find((p) => p.id === selected)
  const quotes = data.prices.filter((p) => p.productId === selected && p.type === 'quoted')
  const reference = data.prices.filter(
    (p) => p.productId === selected && p.type === 'market_reference',
  )

  if (productIdsWithQuotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <PackageSearch size={20} />
        </div>
        <div className="text-sm font-medium text-slate-700">No quoted prices captured yet</div>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
          The comparison screen fills in the moment the first supplier quotes arrive. In real mode
          that happens during supplier onboarding calls; the demo dataset already has captures to
          show how it works.
        </p>
      </div>
    )
  }

  const rows = quotes
    .map((q) => ({
      quote: q,
      supplier: data.suppliers.find((s) => s.id === q.supplierId),
      total: q.ghs + (q.transportGhs ?? 0),
      stale: isPriceStale(q),
    }))
    .sort((a, b) => a.total - b.total)

  const bestTotal = rows.length > 0 ? Math.min(...rows.map((r) => r.total)) : 0
  const worstTotal = rows.length > 0 ? Math.max(...rows.map((r) => r.total)) : 0
  const refAvg =
    reference.length > 0
      ? reference.reduce((sum, r) => sum + r.ghs, 0) / reference.length
      : undefined

  // Stacked unit + transport bars per supplier.
  const chartData = rows.map((r) => ({
    name: (r.supplier?.name ?? 'Unknown').split(' ')[0],
    unit: r.quote.ghs,
    transport: r.quote.transportGhs ?? 0,
    best: r.total === bestTotal,
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Product</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm"
        >
          {productIdsWithQuotes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand} — {p.name} ({p.spec})
            </option>
          ))}
        </select>
        {product && (
          <span className="text-xs text-slate-500">
            Unit: {product.unit} · Like-for-like spec comparison only
          </span>
        )}
      </div>

      {/* Cost comparison chart */}
      <ChartCard
        title="Total delivered cost breakdown"
        sub="Unit price + transport per supplier"
        action={
          rows.length > 1 && worstTotal > bestTotal ? (
            <div className="rounded-lg bg-emerald-50 px-3 py-1.5 text-right">
              <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">
                Best saves
              </div>
              <div className="text-sm font-bold text-emerald-700">
                {ghs(worstTotal - bestTotal)} ({Math.round(((worstTotal - bestTotal) / worstTotal) * 100)}%)
              </div>
            </div>
          ) : undefined
        }
      >
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 56)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: CHART_AXIS, fontSize: 11 }}
              axisLine={{ stroke: CHART_GRID }}
              tickLine={false}
              tickFormatter={(v: number) => ghs(v)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(148, 163, 184, 0.10)' }}
              formatter={(value, name) => [ghs(Number(value)), name === 'unit' ? 'Unit price' : 'Transport']}
            />
            {refAvg !== undefined && (
              <ReferenceLine
                x={refAvg}
                stroke="#d97706"
                strokeDasharray="5 4"
                label={{
                  value: `Market ref ${ghs(Math.round(refAvg))}`,
                  position: 'top',
                  fill: '#b45309',
                  fontSize: 10,
                }}
              />
            )}
            <Bar dataKey="unit" name="unit" stackId="cost" radius={[0, 0, 0, 0]}>
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.best ? '#059669' : '#0284c7'} />
              ))}
            </Bar>
            <Bar dataKey="transport" name="transport" stackId="cost" radius={[0, 6, 6, 0]}>
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.best ? '#34d399' : '#7dd3fc'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-600" /> Unit price
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-300" /> Transport
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Best delivered
            (green)
          </span>
          {refAvg !== undefined && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-amber-600" />{' '}
              Market reference
            </span>
          )}
        </div>
      </ChartCard>

      {/* Full table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Transport</th>
              <th className="px-4 py-3">Total delivered</th>
              <th className="px-4 py-3">Lead time</th>
              <th className="px-4 py-3">Captured</th>
              <th className="px-4 py-3">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ quote, supplier, total, stale }) => (
              <tr
                key={`${quote.supplierId}-${quote.productId}`}
                className={
                  total === bestTotal ? 'bg-emerald-50/60' : 'transition hover:bg-slate-50'
                }
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{supplier?.name ?? 'Unknown supplier'}</div>
                  {supplier?.status && (
                    <div className="mt-0.5">
                      <StatusChip status={supplier.status} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">{ghs(quote.ghs)}</td>
                <td className="px-4 py-3 text-slate-700">
                  {quote.transportGhs === undefined
                    ? '—'
                    : quote.transportGhs === 0
                      ? 'Free'
                      : ghs(quote.transportGhs)}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {ghs(total)}
                  {total === bestTotal && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      best delivered
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {quote.leadTimeDays === undefined ? '—' : `${quote.leadTimeDays}d`}
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-700">{quote.capturedOn}</div>
                  {stale && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {daysSince(quote.capturedOn)}d old — refresh
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {quote.inStock === false ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                      no stock
                    </span>
                  ) : quote.inStock ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      in stock
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reference.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">Market reference:</span>{' '}
          {reference
            .map(
              (r) =>
                `${ghs(r.ghs)} (captured ${r.capturedOn}${r.source ? ` — ${r.source}` : ''})`,
            )
            .join(' · ')}
          {' — '}reference observations, not supplier quotes.
        </div>
      )}
    </div>
  )
}

/* -------------------------------- Planned pages ------------------------------- */

export function PlannedPage({
  title,
  note,
  icon: Icon,
}: {
  title: string
  note: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
        <Icon size={22} />
      </div>
      <div className="text-sm font-semibold text-slate-700">{title} — not built yet</div>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">{note}</p>
      <div className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <Building2 size={12} />
        On the Adensa Ops build roadmap
      </div>
    </div>
  )
}
