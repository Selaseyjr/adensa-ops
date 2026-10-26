import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Dataset } from '../lib/dataSource'
import type { NotificationTarget } from '../lib/notifications'
import { CHART_AXIS, CHART_GRID, CHART_TOOLTIP_STYLE } from '../lib/colors'
import { EmptyState } from '../components/states'
import {
  ORDER_STAGES,
  ORDER_STAGE_LABELS,
  PRICE_STALE_DAYS,
  daysSince,
  isPriceStale,
  type CashEntry,
  type Order,
} from '../types'
import {
  ATTENTION_TONE,
  AttentionItem,
  CASH_KIND_LABELS,
  DetailEmpty,
  DetailTable,
  DetailTotals,
  IN_MOTION_STAGES,
  KpiDetailKey,
  KpiDetailModal,
  STAGE_COLORS,
  Sparkline,
  fmtDay,
  ghs,
  localIso,
} from './shared'

const MS_DAY = 86_400_000

/** Thin-bordered panel: the only card shell on the dashboard. */
function Panel({
  title,
  sub,
  action,
  children,
  className = '',
}: {
  title: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="mt-4 min-w-0 flex-1">{children}</div>
    </section>
  )
}

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Monday 00:00 of the week containing `d`. */
function weekStart(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
}

const isIn = (c: CashEntry) => c.kind === 'deposit_in' || c.kind === 'balance_in'

/** Cash received against an order up to (and including) `asOf`. */
function receivedFor(order: Order, cash: CashEntry[], asOf?: string): number {
  const balances = cash
    .filter((c) => c.orderId === order.id && c.kind === 'balance_in' && (!asOf || c.date <= asOf))
    .reduce((s, c) => s + c.ghs, 0)
  return Math.min(order.valueGhs, order.depositGhs + balances)
}

function ViewLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 transition hover:underline"
    >
      {label} <ArrowRight size={12} aria-hidden="true" />
    </button>
  )
}

export function DashboardPage({
  data,
  onNavigate,
  onOpenOrder,
}: {
  data: Dataset
  onNavigate: (target: NotificationTarget) => void
  onOpenOrder?: (orderId: string) => void
}) {
  const [kpiDetail, setKpiDetail] = useState<KpiDetailKey | null>(null)
  const today = new Date()
  const monthPrefix = data.meta.month
  const monthName = new Date(`${monthPrefix}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long' })
  const orders = data.orders
  const customerName = (id: string) => data.customers.find((c) => c.id === id)?.name ?? 'Customer'
  const openOrder = (id: string) => (onOpenOrder ? onOpenOrder(id) : onNavigate('orders'))

  // Week boundaries: 8 for sparklines, the last 6 for the cash chart.
  const thisMonday = weekStart(today)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisMonday.getTime() - (7 - i) * 7 * MS_DAY)
    const end = new Date(start.getTime() + 6 * MS_DAY)
    return { start: localIso(start), end: localIso(end), label: fmtDay(localIso(start)) }
  })

  // ---- KPIs --------------------------------------------------------------
  const inMotion = orders.filter((o) => IN_MOTION_STAGES.includes(o.stage))
  const inMotionValue = inMotion.reduce((s, o) => s + o.valueGhs, 0)
  const toCollect = inMotion.reduce((s, o) => s + Math.max(0, o.valueGhs - receivedFor(o, data.cash)), 0)

  const isComplete = (o: Order) => o.stage === 'delivered' || o.stage === 'settled'
  const revenueOrders = orders.filter((o) => isComplete(o) && (o.completedOn ?? '').startsWith(monthPrefix))
  const revenue = revenueOrders.reduce((s, o) => s + o.valueGhs, 0)

  const monthCash = data.cash.filter((c) => c.date.startsWith(monthPrefix))
  const cashIn = monthCash.filter(isIn).reduce((s, c) => s + c.ghs, 0)
  const cashOut = monthCash.filter((c) => !isIn(c)).reduce((s, c) => s + c.ghs, 0)
  const cashAsOf = (iso: string) =>
    data.meta.openingCashGhs +
    monthCash.filter((c) => c.date <= iso).reduce((s, c) => s + (isIn(c) ? c.ghs : -c.ghs), 0)
  const cashOnHand = data.meta.openingCashGhs + cashIn - cashOut

  // Sparklines: each KPI re-evaluated at the end of each of the last 8 weeks.
  const sparkRevenue = weeks.map((w) =>
    orders
      .filter((o) => isComplete(o) && o.completedOn && o.completedOn >= w.start && o.completedOn <= w.end)
      .reduce((s, o) => s + o.valueGhs, 0),
  )
  const inMotionAt = (iso: string) =>
    orders.filter(
      (o) =>
        (IN_MOTION_STAGES.includes(o.stage) || o.stage === 'settled') &&
        o.receivedOn <= iso &&
        (o.stage !== 'settled' || (o.completedOn ?? '') > iso),
    )
  const sparkInMotion = weeks.map((w) => inMotionAt(w.end).length)
  const sparkCollect = weeks.map((w) =>
    inMotionAt(w.end).reduce((s, o) => s + Math.max(0, o.valueGhs - receivedFor(o, data.cash, w.end)), 0),
  )
  const sparkCash = weeks.map((w) => cashAsOf(w.end))

  const kpis: { key: KpiDetailKey; label: string; value: string; hint: string; spark: number[] }[] = [
    {
      key: 'revenue',
      label: `Revenue · ${monthName}`,
      value: ghs(revenue),
      hint: `${revenueOrders.length} completed order${revenueOrders.length === 1 ? '' : 's'}`,
      spark: sparkRevenue,
    },
    {
      key: 'orders',
      label: 'Orders in motion',
      value: String(inMotion.length),
      hint: inMotion.length > 0 ? `${ghs(inMotionValue)} in play` : 'None in motion',
      spark: sparkInMotion,
    },
    {
      key: 'collect',
      label: 'Still to collect',
      value: ghs(toCollect),
      hint: `Across ${inMotion.length} open order${inMotion.length === 1 ? '' : 's'}`,
      spark: sparkCollect,
    },
    {
      key: 'cash',
      label: 'Cash on hand',
      value: ghs(cashOnHand),
      hint: `${cashIn - cashOut >= 0 ? "+" : ""}${ghs(cashIn - cashOut)} net this month`,
      spark: sparkCash,
    },
  ]

  // ---- Pipeline: one segmented bar ---------------------------------------
  const stageStats = ORDER_STAGES.map((stage) => {
    const list = orders.filter((o) => o.stage === stage)
    return { stage, count: list.length, value: list.reduce((s, o) => s + o.valueGhs, 0) }
  })
  const pipelineTotal = stageStats.reduce((s, st) => s + st.count, 0)

  // ---- Recent orders -----------------------------------------------------
  const recentOrders = [...orders]
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id.localeCompare(a.id))
    .slice(0, 6)

  // ---- Needs attention: deterministic rule checks ------------------------
  const attention: AttentionItem[] = useMemo(() => {
    const nameOf = (id: string) => data.customers.find((c) => c.id === id)?.name ?? 'Customer'
    const items: AttentionItem[] = []
    for (const q of data.quotes.filter((q) => q.status === 'sent')) {
      const age = daysSince(q.sentOn)
      if (age >= 3) {
        items.push({
          key: `q-${q.id}`,
          tone: age >= 7 ? 'rose' : 'amber',
          icon: Clock,
          text: `${q.id} unanswered · ${nameOf(q.customerId)}`,
          age: `${age}d`,
          target: 'quotes',
        })
      }
    }
    for (const o of data.orders.filter((o) => o.stage === 'quoted')) {
      const age = daysSince(o.receivedOn)
      if (age >= 2) {
        items.push({
          key: `o-${o.id}`,
          tone: age >= 4 ? 'rose' : 'amber',
          icon: Wallet,
          text: `${o.id} awaiting deposit · ${ghs(o.valueGhs)}`,
          age: `${age}d`,
          target: 'orders',
        })
      }
    }
    const staleCount = data.prices.filter((p) => isPriceStale(p)).length
    if (staleCount > 0) {
      items.push({
        key: 'stale',
        tone: 'amber',
        icon: AlertTriangle,
        text: `${staleCount} price${staleCount === 1 ? '' : 's'} older than ${PRICE_STALE_DAYS} days`,
        age: 'Re-check',
        target: 'compare',
      })
    }
    for (const c of data.customers) {
      if (!c.nextFollowUp) continue
      const due = -daysSince(c.nextFollowUp)
      if (due <= 0) {
        items.push({
          key: `f-${c.id}`,
          tone: due < -3 ? 'rose' : 'amber',
          icon: Users,
          text: `Follow-up · ${c.name}`,
          age: due < 0 ? `${-due}d late` : 'Today',
          target: 'customers',
        })
      }
    }
    for (const i of data.inquiries.filter((i) => i.status === 'new')) {
      const age = daysSince(i.receivedOn)
      if (age >= 1) {
        items.push({
          key: `i-${i.id}`,
          tone: 'amber',
          icon: Bell,
          text: `Inquiry unanswered · ${i.customerName}`,
          age: `${age}d`,
          target: 'customers',
        })
      }
    }
    const weight = { rose: 0, amber: 1, brand: 2 }
    return items.sort((a, b) => weight[a.tone] - weight[b.tone])
  }, [data])

  // ---- Cash in / out, last 6 weeks ---------------------------------------
  const cashWeeks = weeks.slice(2).map((w) => {
    const entries = data.cash.filter((c) => c.date >= w.start && c.date <= w.end)
    return {
      week: w.label,
      in: entries.filter(isIn).reduce((s, c) => s + c.ghs, 0),
      out: entries.filter((c) => !isIn(c)).reduce((s, c) => s + c.ghs, 0),
    }
  })
  const cashWeeksEmpty = cashWeeks.every((w) => w.in === 0 && w.out === 0)
  const sixIn = cashWeeks.reduce((s, w) => s + w.in, 0)
  const sixOut = cashWeeks.reduce((s, w) => s + w.out, 0)

  // ---- Drill-down rows ---------------------------------------------------
  const inMotionRows = [...inMotion]
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
    .map((o) => ({
      order: o,
      customer: customerName(o.customerId),
      outstanding: Math.max(0, o.valueGhs - receivedFor(o, data.cash)),
      days: daysSince(o.receivedOn),
    }))
  let ledgerBalance = data.meta.openingCashGhs
  const ledgerRunning = [...monthCash]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((entry) => {
      ledgerBalance += isIn(entry) ? entry.ghs : -entry.ghs
      return { entry, inflow: isIn(entry), running: ledgerBalance }
    })

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{greeting(today)}</h2>
        <p className="mt-0.5 text-sm text-ink-faint">
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </section>

      {/* ===== KPI cards ===== */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKpiDetail(k.key)}
            aria-haspopup="dialog"
            className="group flex min-w-0 items-end justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink-faint">{k.label}</span>
              <span className="num mt-1 block truncate text-2xl font-semibold tracking-tight text-ink">{k.value}</span>
              <span className="mt-1 block truncate text-xs text-ink-faint">{k.hint}</span>
            </span>
            <span className="shrink-0" title="Last 8 weeks">
              <Sparkline data={k.spark} color="var(--color-brand-400)" />
            </span>
          </button>
        ))}
      </section>

      {/* ===== Pipeline ===== */}
      <Panel
        title="Order pipeline"
        sub={`${pipelineTotal} order${pipelineTotal === 1 ? '' : 's'} · ${ghs(stageStats.reduce((s, st) => s + st.value, 0))}`}
        action={<ViewLink label="Orders" onClick={() => onNavigate('orders')} />}
      >
        {pipelineTotal === 0 ? (
          <EmptyState icon={CheckCircle2} title="No orders yet." />
        ) : (
          <>
            <div
              role="img"
              aria-label={`Pipeline: ${stageStats.map((s) => `${ORDER_STAGE_LABELS[s.stage]} ${s.count}`).join(', ')}`}
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
            >
              {stageStats
                .filter((s) => s.count > 0)
                .map((s) => (
                  <div
                    key={s.stage}
                    title={`${ORDER_STAGE_LABELS[s.stage]}: ${s.count} · ${ghs(s.value)}`}
                    className="h-full transition-[flex-grow] duration-500"
                    style={{ flexGrow: s.count, backgroundColor: STAGE_COLORS[s.stage] }}
                  />
                ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              {stageStats.map((s) => (
                <li key={s.stage} className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[s.stage] }}
                    />
                    {ORDER_STAGE_LABELS[s.stage]}
                  </span>
                  <span className="num mt-0.5 block text-sm font-semibold text-ink">{s.count}</span>
                  <span className="num block truncate text-[11px] text-ink-faint">{ghs(s.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* ===== Recent orders ===== */}
        <Panel
          className="xl:col-span-2"
          title="Recent orders"
          action={<ViewLink label="View all" onClick={() => onNavigate('orders')} />}
        >
          {recentOrders.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No orders yet." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-y border-line text-[11px] text-ink-faint">
                    <th className="px-4 py-2 font-medium sm:pl-5">Order</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="px-4 py-2 text-right font-medium sm:pr-5">Balance due</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => {
                    const balance = Math.max(0, o.valueGhs - receivedFor(o, data.cash))
                    return (
                      <tr
                        key={o.id}
                        onClick={() => openOrder(o.id)}
                        className="cursor-pointer border-b border-line transition last:border-0 hover:bg-subtle"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 sm:pl-5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openOrder(o.id)
                            }}
                            className="num font-medium text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                          >
                            {o.id}
                          </button>
                          <span className="block text-[11px] text-ink-faint">{fmtDay(o.receivedOn)}</span>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-soft">{customerName(o.customerId)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-ink-soft">
                            <span
                              aria-hidden="true"
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: STAGE_COLORS[o.stage] }}
                            />
                            {ORDER_STAGE_LABELS[o.stage]}
                          </span>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-2.5 text-right text-ink">{ghs(o.valueGhs)}</td>
                        <td
                          className={`num whitespace-nowrap px-4 py-2.5 text-right sm:pr-5 ${
                            balance > 0 ? 'text-ink' : 'text-ink-faint'
                          }`}
                        >
                          {balance > 0 ? ghs(balance) : 'Paid'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ===== Needs attention ===== */}
        <Panel
          title="Needs attention"
          sub={attention.length > 0 ? `${attention.length} rule check${attention.length === 1 ? '' : 's'} flagged` : undefined}
        >
          {attention.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All rule checks pass." />
          ) : (
            <ul className="-mx-2 max-h-[340px] space-y-0.5 overflow-y-auto">
              {attention.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.target)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${ATTENTION_TONE[item.tone]}`}>
                        <Icon size={13} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.text}</span>
                      <span className="shrink-0 text-[11px] font-medium text-ink-faint">{item.age}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ===== Cash in / out, last 6 weeks ===== */}
      <Panel
        title="Cash in and out"
        sub={`Last 6 weeks · ${ghs(sixIn)} in · ${ghs(sixOut)} out`}
        action={
          <div className="flex items-center gap-3 text-[11px] text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-[var(--color-cash-in)]" />
              In
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-[var(--color-cash-out)]" />
              Out
            </span>
          </div>
        }
      >
        {cashWeeksEmpty ? (
          <EmptyState icon={Wallet} title="No cash movements in the last 6 weeks." />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashWeeks} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_GRID} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                <YAxis
                  width={48}
                  tick={{ fontSize: 11, fill: CHART_AXIS }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-subtle)' }}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v, name) => [ghs(Number(v)), name === 'in' ? 'Cash in' : 'Cash out']}
                  labelFormatter={(l) => `Week of ${l}`}
                />
                <Bar dataKey="in" name="in" fill="var(--color-cash-in)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="out" name="out" fill="var(--color-cash-out)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* ===== KPI drill-down ===== */}
      {kpiDetail && (
        <KpiDetailModal
          title={
            kpiDetail === 'revenue'
              ? `Revenue · ${monthName}`
              : kpiDetail === 'cash'
                ? `Cash ledger · ${monthName}`
                : kpiDetail === 'collect'
                  ? 'Still to collect'
                  : 'Orders in motion'
          }
          sub={
            kpiDetail === 'revenue'
              ? 'Orders delivered or settled this month'
              : kpiDetail === 'cash'
                ? 'Opening balance and every movement this month'
                : 'Deposit paid through to delivery'
          }
          onClose={() => setKpiDetail(null)}
        >
          {kpiDetail === 'revenue' &&
            (revenueOrders.length === 0 ? (
              <DetailEmpty text={`No completed orders in ${monthName}.`} />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Revenue', value: ghs(revenue) },
                    { label: 'Received', value: ghs(revenueOrders.reduce((s, o) => s + receivedFor(o, data.cash), 0)) },
                    {
                      label: 'Balance due',
                      value: ghs(revenueOrders.reduce((s, o) => s + o.valueGhs - receivedFor(o, data.cash), 0)),
                    },
                    { label: 'Orders', value: String(revenueOrders.length) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Order' },
                    { label: 'Customer' },
                    { label: 'Completed' },
                    { label: 'Value', right: true },
                    { label: 'Balance due', right: true },
                  ]}
                  rows={revenueOrders.map((o) => {
                    const due = o.valueGhs - receivedFor(o, data.cash)
                    return {
                      key: o.id,
                      cells: [
                        <span key="id" className="whitespace-nowrap font-medium">{o.id}</span>,
                        <span key="c" className="text-ink-soft">{customerName(o.customerId)}</span>,
                        <span key="d" className="whitespace-nowrap text-ink-soft">
                          {o.completedOn ? fmtDay(o.completedOn) : 'N/A'}
                        </span>,
                        <span key="v">{ghs(o.valueGhs)}</span>,
                        <span key="b" className={due > 0 ? 'font-medium text-warning' : 'text-ink-faint'}>
                          {due > 0 ? ghs(due) : 'Paid'}
                        </span>,
                      ],
                    }
                  })}
                />
              </>
            ))}

          {(kpiDetail === 'orders' || kpiDetail === 'collect') &&
            (inMotionRows.length === 0 ? (
              <DetailEmpty text="No orders in motion." />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Orders', value: String(inMotionRows.length) },
                    { label: 'Value', value: ghs(inMotionValue) },
                    { label: 'Received', value: ghs(inMotionValue - toCollect) },
                    { label: 'Still to collect', value: ghs(toCollect) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Order' },
                    { label: 'Customer' },
                    { label: 'Stage' },
                    { label: 'Value', right: true },
                    { label: 'Outstanding', right: true },
                    { label: 'Age', right: true },
                  ]}
                  rows={inMotionRows.map(({ order, customer, outstanding, days }) => ({
                    key: order.id,
                    cells: [
                      <span key="id" className="whitespace-nowrap font-medium">{order.id}</span>,
                      <span key="c" className="text-ink-soft">{customer}</span>,
                      <span key="s" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: STAGE_COLORS[order.stage] }}
                        />
                        {ORDER_STAGE_LABELS[order.stage]}
                      </span>,
                      <span key="v">{ghs(order.valueGhs)}</span>,
                      <span key="o" className={outstanding > 0 ? 'font-medium text-warning' : 'text-ink-faint'}>
                        {ghs(outstanding)}
                      </span>,
                      <span key="a" className="whitespace-nowrap text-ink-soft">{days}d</span>,
                    ],
                  }))}
                />
              </>
            ))}

          {kpiDetail === 'cash' &&
            (ledgerRunning.length === 0 ? (
              <DetailEmpty text="No cash movements this month." />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Opening', value: ghs(data.meta.openingCashGhs) },
                    { label: 'In', value: ghs(cashIn) },
                    { label: 'Out', value: ghs(cashOut) },
                    { label: 'On hand', value: ghs(cashOnHand) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Date' },
                    { label: 'Entry' },
                    { label: 'In', right: true },
                    { label: 'Out', right: true },
                    { label: 'Balance', right: true },
                  ]}
                  rows={ledgerRunning.map(({ entry, inflow, running }) => ({
                    key: entry.id,
                    cells: [
                      <span key="d" className="whitespace-nowrap text-ink-soft">{fmtDay(entry.date)}</span>,
                      <span key="l">
                        <span className="block">{entry.label}</span>
                        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                          {CASH_KIND_LABELS[entry.kind]}
                        </span>
                      </span>,
                      <span key="i" className={inflow ? 'font-semibold text-success' : ''}>
                        {inflow ? ghs(entry.ghs) : ''}
                      </span>,
                      <span key="o" className={inflow ? '' : 'font-semibold text-ink'}>
                        {inflow ? '' : ghs(entry.ghs)}
                      </span>,
                      <span key="b" className="text-ink-soft">{ghs(running)}</span>,
                    ],
                  }))}
                />
              </>
            ))}
        </KpiDetailModal>
      )}
    </div>
  )
}
