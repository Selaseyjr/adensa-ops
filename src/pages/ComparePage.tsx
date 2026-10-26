import { useMemo, useState } from 'react'
import {
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
import { CalendarClock, PackageSearch, Tag, TrendingUp } from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import {
  CATEGORY_COLORS,
  CHART_AXIS,
  CHART_GRID,
  CHART_LABEL,
  CHART_TOOLTIP_STYLE,
} from '../lib/colors'
import { bestDelivered, deliveredCosts, marketReference, productLabel, savingsVsMarket } from '../lib/compare'
import { formatGhsCompact } from '../lib/format'
import { ChartCard } from '../components/charts'
import { EmptyState } from '../components/states'
import { CATEGORY_LABELS, PRICE_STALE_DAYS, daysSince, isPriceStale } from '../types'
import { CATEGORIES, StatusChip, TABLE_MIN_W, fmtDay, ghs, localIso } from './shared'

const MS_DAY = 86_400_000
/** Days of capture history shown on the activity chart. */
const ACTIVITY_DAYS = 42

const inputCls =
  'rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-400'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-ink-faint">{label}</div>
      <div
        className={`num mt-1 truncate text-xl font-semibold tracking-tight ${
          tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-faint">{sub}</div>}
    </div>
  )
}

export function ComparePage({ data }: { data: Dataset }) {
  const productsWithQuotes = useMemo(() => {
    const ids = new Set(data.prices.filter((p) => p.type === 'quoted').map((p) => p.productId))
    return data.products.filter((p) => ids.has(p.id))
  }, [data])

  const [selected, setSelected] = useState<string>(productsWithQuotes[0]?.id ?? '')
  const [qtyInput, setQtyInput] = useState('100')
  const qty = Math.max(1, Math.floor(Number(qtyInput)) || 1)

  // Capture activity on a real time axis: one slot per calendar day, empty
  // days included, so gaps in price checking are visible.
  const timeline = useMemo(() => {
    const today = new Date()
    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (ACTIVITY_DAYS - 1 - i))
      return { date: localIso(d), t: d.getTime(), quoted: 0, reference: 0 }
    })
    const byDate = new Map(days.map((d) => [d.date, d]))
    for (const p of data.prices) {
      const slot = byDate.get(p.capturedOn)
      if (!slot) continue
      if (p.type === 'quoted') slot.quoted += 1
      else slot.reference += 1
    }
    return days
  }, [data])
  const timelineEmpty = timeline.every((d) => d.quoted + d.reference === 0)
  const weekTicks = timeline.filter((_, i) => (ACTIVITY_DAYS - 1 - i) % 7 === 0).map((d) => d.t)

  if (productsWithQuotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-12 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-ink-faint">
          <PackageSearch size={20} />
        </div>
        <div className="text-sm font-medium text-ink">No supplier quotes captured yet</div>
      </div>
    )
  }

  const product = data.products.find((p) => p.id === selected)
  const unit = product?.unit ?? 'unit'
  const rows = deliveredCosts(data.prices, data.suppliers, selected, qty)
  const best = bestDelivered(rows)
  const reference = marketReference(data.prices, selected)
  const savings = savingsVsMarket(best, reference, qty)
  const references = data.prices.filter((p) => p.type === 'market_reference')

  const chartData = rows.map((r) => ({
    key: r.price.supplierId ?? r.unitGhs,
    name: (r.supplier?.name ?? 'Unknown').split(' ').slice(0, 2).join(' '),
    unit: r.unitGhs,
    transport: r.transportPerUnitGhs,
    best: r === best,
    eligible: r.eligible,
  }))

  return (
    <div className="space-y-5">
      {/* Product + quantity */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-soft">
          Product
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`${inputCls} min-w-0 max-w-full`}
          >
            {productsWithQuotes.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Quantity ({unit}s)
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            className={`${inputCls} num w-28`}
          />
        </label>
        <p className="pb-2 text-xs text-ink-faint">
          Transport is quoted per load and spread across {qty.toLocaleString('en-GH')} {unit}
          {qty === 1 ? '' : 's'}.
        </p>
      </div>

      {/* Headline comparison */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={`Best delivered per ${unit}`}
          value={best ? ghs(best.perUnitGhs) : 'N/A'}
          sub={best ? `${best.supplier?.name ?? 'Supplier'} · ${ghs(best.totalGhs)} for ${qty.toLocaleString('en-GH')}` : 'No fresh, in-stock quote'}
        />
        <Stat
          label={`Market reference per ${unit}`}
          value={reference ? ghs(reference.ghs) : 'N/A'}
          sub={reference ? `Captured ${fmtDay(reference.capturedOn)}` : 'No market observation yet'}
        />
        <Stat
          label="Saving vs market"
          value={
            savings
              ? `${ghs(savings.perUnitGhs)} per ${unit}`
              : 'N/A'
          }
          sub={
            savings
              ? `${ghs(savings.totalGhs)} on ${qty.toLocaleString('en-GH')} · ${Math.round(savings.pct * 100)}%`
              : reference
                ? 'No eligible supplier quote'
                : 'Needs a market reference'
          }
          tone={savings ? (savings.perUnitGhs >= 0 ? 'good' : 'bad') : undefined}
        />
      </div>

      {/* Per-unit delivered cost per supplier */}
      <ChartCard title={`Delivered cost per ${unit}`} sub="Unit price plus transport per unit, cheapest first">
        <div className="min-w-0">
          <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 52)}>
            <BarChart data={chartData} layout="vertical" barCategoryGap={10} margin={{ top: 14, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                axisLine={{ stroke: CHART_GRID }}
                tickLine={false}
                tickFormatter={(v: number) => formatGhsCompact(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: CHART_LABEL, fontSize: 12, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={120}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'var(--color-subtle)' }}
                formatter={(value, name) => [ghs(Number(value)), name === 'unit' ? 'Unit price' : 'Transport per unit']}
              />
              {reference && (
                <ReferenceLine
                  x={reference.ghs}
                  stroke="var(--color-ink-faint)"
                  strokeDasharray="5 4"
                  label={{ value: `Market ${ghs(reference.ghs)}`, position: 'top', fill: CHART_AXIS, fontSize: 10 }}
                />
              )}
              <Bar dataKey="unit" name="unit" stackId="cost">
                {chartData.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.best ? 'var(--color-success)' : 'var(--color-stage-ordered)'}
                    fillOpacity={d.eligible ? 1 : 0.4}
                  />
                ))}
              </Bar>
              <Bar dataKey="transport" name="transport" stackId="cost" radius={[0, 4, 4, 0]}>
                {chartData.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.best ? 'var(--color-stage-delivered)' : 'var(--color-stage-quoted)'}
                    fillOpacity={d.eligible ? 1 : 0.4}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-stage-ordered)]" /> Unit price
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-stage-quoted)]" /> Transport per unit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" /> Best delivered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-stage-ordered)] opacity-40" /> Stale or out of
            stock
          </span>
          {reference && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-ink-faint" /> Market reference
            </span>
          )}
        </div>
      </ChartCard>

      {/* Full table */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className={`w-full text-left text-sm ${TABLE_MIN_W}`}>
          <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="px-4 py-3 text-right font-medium">Transport / load</th>
              <th className="px-4 py-3 text-right font-medium">Delivered / {unit}</th>
              <th className="px-4 py-3 text-right font-medium">Total for {qty.toLocaleString('en-GH')}</th>
              <th className="px-4 py-3 font-medium">Lead time</th>
              <th className="px-4 py-3 font-medium">Captured</th>
              <th className="px-4 py-3 font-medium">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.price.supplierId}-${r.price.productId}`} className={r === best ? 'bg-success-soft' : 'transition hover:bg-subtle'}>
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{r.supplier?.name ?? 'Unknown supplier'}</div>
                  {r.supplier?.status && (
                    <div className="mt-0.5">
                      <StatusChip status={r.supplier.status} />
                    </div>
                  )}
                </td>
                <td className="num px-4 py-3 text-right text-ink">{ghs(r.unitGhs)}</td>
                <td className="num px-4 py-3 text-right text-ink">
                  {r.price.transportGhs === undefined ? 'N/A' : r.transportGhs === 0 ? 'Free' : ghs(r.transportGhs)}
                </td>
                <td className="num px-4 py-3 text-right font-semibold text-ink">
                  {ghs(r.perUnitGhs)}
                  {r === best && (
                    <span className="ml-2 rounded-full bg-success px-2 py-0.5 text-[10px] font-medium text-white">Best</span>
                  )}
                </td>
                <td className="num px-4 py-3 text-right text-ink-soft">{ghs(r.totalGhs)}</td>
                <td className="px-4 py-3 text-ink">{r.price.leadTimeDays === undefined ? 'N/A' : `${r.price.leadTimeDays}d`}</td>
                <td className="px-4 py-3">
                  <div className="whitespace-nowrap text-ink">{fmtDay(r.price.capturedOn)}</div>
                  {r.stale && (
                    <span
                      title={`Older than ${PRICE_STALE_DAYS} days: re-check before quoting`}
                      className="whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning"
                    >
                      Re-check · {daysSince(r.price.capturedOn)}d
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.outOfStock ? (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-medium text-danger">No stock</span>
                  ) : r.price.inStock ? (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">In stock</span>
                  ) : (
                    <span className="text-ink-faint">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Capture activity: real time axis */}
      <ChartCard title="Price capture activity" sub={`Quotes and market references captured per day · last ${ACTIVITY_DAYS} days`}>
        {timelineEmpty ? (
          <EmptyState icon={TrendingUp} title="No price observations in this period." />
        ) : (
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeline} barCategoryGap={1} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[timeline[0].t - MS_DAY / 2, timeline[timeline.length - 1].t + MS_DAY / 2]}
                  ticks={weekTicks}
                  tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  axisLine={{ stroke: CHART_GRID }}
                  tickLine={false}
                  tickFormatter={(t: number) => fmtDay(localIso(new Date(t)))}
                />
                <YAxis tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'var(--color-subtle)' }}
                  labelFormatter={(t) => fmtDay(localIso(new Date(Number(t))))}
                />
                <Bar dataKey="quoted" name="Supplier quotes" stackId="c" fill="var(--color-cash-in)" maxBarSize={14} />
                <Bar dataKey="reference" name="Market references" stackId="c" fill="var(--color-cash-out)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex gap-4 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-cash-in)]" /> Supplier quotes
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-cash-out)]" /> Market references
              </span>
            </div>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Category coverage" sub="Products with at least one supplier quote">
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const total = data.products.filter((p) => p.category === cat).length
              const covered = data.products.filter(
                (p) => p.category === cat && data.prices.some((pr) => pr.productId === p.id && pr.type === 'quoted'),
              ).length
              const pct = total === 0 ? 0 : Math.round((covered / total) * 100)
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-ink">{CATEGORY_LABELS[cat]}</span>
                    <span className="num shrink-0 text-ink-faint">
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

        <ChartCard title="Market reference observations" sub="Dated street prices used to check supplier quotes" className="lg:col-span-2">
          {references.length === 0 ? (
            <EmptyState icon={Tag} title="No reference observations yet." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {references.map((p, i) => {
                const refProduct = data.products.find((pr) => pr.id === p.productId)
                const stale = isPriceStale(p)
                return (
                  <div key={`${p.productId}-${p.capturedOn}-${i}`} className="min-w-0 rounded-lg border border-line bg-subtle p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-xs font-medium text-ink">{refProduct ? productLabel(refProduct) : p.productId}</div>
                      <div className="num shrink-0 text-sm font-semibold text-ink">{ghs(p.ghs)}</div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <CalendarClock size={12} />
                      {fmtDay(p.capturedOn)}
                      {stale && (
                        <span className="rounded-full bg-warning-soft px-1.5 py-0.5 font-medium text-warning">
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
