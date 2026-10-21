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
  CalendarClock,
  PackageSearch,
  Tag,
  TrendingUp,
} from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import {
  ALERT_AMBER,
  CATEGORY_COLORS,
  CHART_AXIS,
  CHART_GRID,
  CHART_LABEL,
  CHART_TOOLTIP_STYLE,
  SUCCESS_BLUE,
  SUCCESS_BLUE_SOFT,
} from '../lib/colors'
import { ChartCard } from '../components/charts'
import { EmptyState } from '../components/states'
import {
  CATEGORY_LABELS,
  daysSince,
  isPriceStale,
} from '../types'
import {
  CATEGORIES,
  StatusChip,
  TABLE_MIN_W,
  ghs,
} from './shared'

export function ComparePage({ data }: { data: Dataset }) {
  const productIdsWithQuotes = useMemo(() => {
    const ids = new Set(data.prices.filter((p) => p.type === 'quoted').map((p) => p.productId))
    return data.products.filter((p) => ids.has(p.id))
  }, [data])

  const [selected, setSelected] = useState<string>(productIdsWithQuotes[0]?.id ?? '')

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

  const product = data.products.find((p) => p.id === selected)
  const quotes = data.prices.filter((p) => p.productId === selected && p.type === 'quoted')
  const reference = data.prices.filter(
    (p) => p.productId === selected && p.type === 'market_reference',
  )

  if (productIdsWithQuotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-12 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-ink-faint">
          <PackageSearch size={20} />
        </div>
        <div className="text-sm font-medium text-ink">No quoted prices captured yet</div>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-soft">
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

  // Stacked unit + transport bars per supplier. Best row goes success teal so
  // "the winner" reads instantly without entering the orange accent lane.
  const chartData = rows.map((r) => ({
    name: (r.supplier?.name ?? 'Unknown').split(' ')[0],
    unit: r.quote.ghs,
    transport: r.quote.transportGhs ?? 0,
    best: r.total === bestTotal,
  }))

  return (
    <div className="space-y-5">
      <ChartCard
        title="Price capture activity"
        sub="Quoted prices vs market references, captured per day"
      >
        {timeline.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No price observations yet." />
        ) : (
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradQuoted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradRef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ALERT_AMBER} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ALERT_AMBER} stopOpacity={0.02} />
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
                  stroke="var(--color-brand-500)"
                  strokeWidth={2}
                  fill="url(#gradQuoted)"
                />
                <Area
                  type="monotone"
                  dataKey="reference"
                  name="Market references"
                  stackId="1"
                  stroke={ALERT_AMBER}
                  strokeWidth={2}
                  fill="url(#gradRef)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-ink-soft">Product</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-w-0 max-w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink shadow-sm"
        >
          {productIdsWithQuotes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand} · {p.name} ({p.spec})
            </option>
          ))}
        </select>
        {product && (
          <span className="text-xs text-ink-faint">
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
            <div className="rounded-lg bg-brand-50 px-3 py-1.5 text-right dark:bg-brand-950/50">
              <div className="text-[10px] font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">
                Best saves
              </div>
              <div className="text-sm font-bold text-brand-800 dark:text-brand-200">
                {ghs(worstTotal - bestTotal)} ({Math.round(((worstTotal - bestTotal) / worstTotal) * 100)}%)
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="min-w-0">
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
                tick={{ fill: CHART_LABEL, fontSize: 12, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(124, 58, 237, 0.10)' }}
                formatter={(value, name) => [ghs(Number(value)), name === 'unit' ? 'Unit price' : 'Transport']}
              />
              {refAvg !== undefined && (
                <ReferenceLine
                  x={refAvg}
                  stroke={ALERT_AMBER}
                  strokeDasharray="5 4"
                  label={{
                    value: `Market ref ${ghs(Math.round(refAvg))}`,
                    position: 'top',
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />
              )}
              <Bar dataKey="unit" name="unit" stackId="cost" radius={[0, 0, 0, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.best ? SUCCESS_BLUE : 'var(--color-stage-ordered)'} />
                ))}
              </Bar>
              <Bar dataKey="transport" name="transport" stackId="cost" radius={[0, 6, 6, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.best ? 'var(--color-cat-safety)' : SUCCESS_BLUE_SOFT} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-600" /> Unit price
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-300" /> Transport
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-900" /> Best delivered
            (deep blue)
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
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className={`w-full text-left text-sm ${TABLE_MIN_W}`}>
          <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Transport</th>
              <th className="px-4 py-3 text-right">Total delivered</th>
              <th className="px-4 py-3">Lead time</th>
              <th className="px-4 py-3">Captured</th>
              <th className="px-4 py-3">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ quote, supplier, total, stale }) => (
              <tr
                key={`${quote.supplierId}-${quote.productId}`}
                className={
                  total === bestTotal
                    ? 'bg-brand-50/70 dark:bg-brand-950/40'
                    : 'transition hover:bg-subtle'
                }
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{supplier?.name ?? 'Unknown supplier'}</div>
                  {supplier?.status && (
                    <div className="mt-0.5">
                      <StatusChip status={supplier.status} />
                    </div>
                  )}
                </td>
                <td className="num px-4 py-3 text-right text-ink">{ghs(quote.ghs)}</td>
                <td className="num px-4 py-3 text-right text-ink">
                  {quote.transportGhs === undefined
                    ? 'N/A'
                    : quote.transportGhs === 0
                      ? 'Free'
                      : ghs(quote.transportGhs)}
                </td>
                <td className="num px-4 py-3 text-right font-semibold text-ink">
                  {ghs(total)}
                  {total === bestTotal && (
                    <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
                      best delivered
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink">
                  {quote.leadTimeDays === undefined ? 'N/A' : `${quote.leadTimeDays}d`}
                </td>
                <td className="px-4 py-3">
                  <div className="text-ink">{quote.capturedOn}</div>
                  {stale && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      {daysSince(quote.capturedOn)}d old
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {quote.inStock === false ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      no stock
                    </span>
                  ) : quote.inStock ? (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
                      in stock
                    </span>
                  ) : (
                    <span className="text-ink-faint">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reference.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="font-semibold">Market reference:</span>{' '}
          {reference
            .map(
              (r) =>
                `${ghs(r.ghs)} (captured ${r.capturedOn}${r.source ? `, ${r.source}` : ''})`,
            )
            .join(' · ')}
          {' · '}reference observations, not supplier quotes.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Category coverage" sub="Products with at least one quoted price">
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
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-ink">{CATEGORY_LABELS[cat]}</span>
                    <span className="shrink-0 text-ink-faint">
                      {covered}/{total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-track">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </ChartCard>

        <ChartCard
          title="Market reference observations"
          sub="Dated observations used to sanity-check supplier quotes"
          className="lg:col-span-2"
        >
          {reference.length === 0 ? (
            <EmptyState icon={Tag} title="No reference observations yet." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {reference.map((p, i) => {
                const refProduct = data.products.find((pr) => pr.id === p.productId)
                const stale = isPriceStale(p)
                return (
                  <div
                    key={`${p.productId}-${p.capturedOn}-${i}`}
                    className="min-w-0 rounded-lg border border-line bg-subtle p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-xs font-medium text-ink">
                        {refProduct ? `${refProduct.brand} · ${refProduct.name}` : p.productId}
                      </div>
                      <div className="shrink-0 text-sm font-bold text-ink">{ghs(p.ghs)}</div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <CalendarClock size={12} />
                      {p.capturedOn}
                      {stale && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {daysSince(p.capturedOn)}d old
                        </span>
                      )}
                    </div>
                    {p.source && (
                      <div className="mt-1 truncate text-[11px] text-ink-faint" title={p.source}>
                        {p.source}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

/* -------------------------------- Planned pages ------------------------------- */

