import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  PackageSearch,
  Tag,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
  Users,
  Wallet,
} from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import type { NotificationTarget } from '../lib/notifications'
import {
  ALERT_AMBER,
  CATEGORY_COLORS,
  CATEGORY_SHORT,
  SUCCESS_BLUE,
} from '../lib/colors'
import { ChartCard } from '../components/charts'
import { EmptyState } from '../components/states'
import { SupplierMap } from '../components/SupplierMap'
import {
  ORDER_STAGES,
  ORDER_STAGE_LABELS,
  PRICE_STALE_DAYS,
  daysSince,
  isPriceStale,
} from '../types'
import {
  ATTENTION_TONE,
  AttentionItem,
  CASH_KIND_LABELS,
  DetailEmpty,
  DetailTable,
  DetailTotals,
  INQUIRY_STATUS_TONE,
  IN_MOTION_STAGES,
  KpiDetailKey,
  KpiDetailModal,
  MapLegend,
  STAGE_COLORS,
  StatCard,
  fmtDay,
  ghs,
  localIso,
} from './shared'

export function DashboardPage({
  data,
  unreadCount,
  onGetStarted,
  onNavigate,
}: {
  data: Dataset
  unreadCount: number
  onGetStarted: () => void
  onNavigate: (target: NotificationTarget) => void
}) {
  const monthPrefix = data.meta.month
  const monthName = new Date(`${monthPrefix}-01T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
  })
  const [kpiDetail, setKpiDetail] = useState<KpiDetailKey | null>(null)

  const today = new Date()
  const todayStr = localIso(today)
  const tomorrowStr = localIso(new Date(today.getTime() + 86_400_000))

  const orders = data.orders

  // Money and orders -------------------------------------------------------
  const revenueMonth = orders
    .filter(
      (o) =>
        (o.stage === 'delivered' || o.stage === 'settled') &&
        (o.completedOn ?? '').startsWith(monthPrefix),
    )
    .reduce((s, o) => s + o.valueGhs, 0)
  const target = data.meta.revenueTargetGhs
  const targetPct = target > 0 ? Math.round((revenueMonth / target) * 100) : 0
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const pacePct = Math.round((dayOfMonth / daysInMonth) * 100)
  const onPace = targetPct >= pacePct

  const inMotion = orders.filter((o) => IN_MOTION_STAGES.includes(o.stage))
  const inMotionValue = inMotion.reduce((s, o) => s + o.valueGhs, 0)
  const balanceInByOrder = new Map<string, number>()
  for (const c of data.cash) {
    if (c.kind === 'balance_in' && c.orderId) {
      balanceInByOrder.set(c.orderId, (balanceInByOrder.get(c.orderId) ?? 0) + c.ghs)
    }
  }
  const receivable = inMotion.reduce(
    (s, o) => s + Math.max(0, o.valueGhs - o.depositGhs - (balanceInByOrder.get(o.id) ?? 0)),
    0,
  )

  // Drill-down sources: the exact rows each KPI card opens into.
  const revenueDetail = orders
    .filter(
      (o) =>
        (o.stage === 'delivered' || o.stage === 'settled') &&
        (o.completedOn ?? '').startsWith(monthPrefix),
    )
    .sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? ''))
    .map((o) => {
      // Balances on top of the recorded deposit, capped at the order value so
      // a fully-settled order never shows more cash than it is worth.
      const balance = Math.min(balanceInByOrder.get(o.id) ?? 0, Math.max(0, o.valueGhs - o.depositGhs))
      const cashReceived = Math.min(o.valueGhs, o.depositGhs + balance)
      return {
        order: o,
        customer: data.customers.find((c) => c.id === o.customerId)?.name ?? 'Customer',
        balance,
        cashReceived,
        outstanding: o.valueGhs - cashReceived,
      }
    })
  const revenueDetailTotals = revenueDetail.reduce(
    (acc, r) => ({
      value: acc.value + r.order.valueGhs,
      cash: acc.cash + r.cashReceived,
      outstanding: acc.outstanding + r.outstanding,
    }),
    { value: 0, cash: 0, outstanding: 0 },
  )

  const inMotionRows = [...inMotion]
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
    .map((o) => ({
      order: o,
      customer: data.customers.find((c) => c.id === o.customerId)?.name ?? 'Customer',
      outstanding: Math.max(0, o.valueGhs - o.depositGhs - (balanceInByOrder.get(o.id) ?? 0)),
      days: daysSince(o.receivedOn),
    }))

  const monthCash = data.cash.filter((c) => c.date.startsWith(monthPrefix))
  const cashIn = monthCash
    .filter((c) => c.kind === 'deposit_in' || c.kind === 'balance_in')
    .reduce((s, c) => s + c.ghs, 0)
  const cashOut = monthCash
    .filter((c) => c.kind === 'supplier_out' || c.kind === 'expense_out')
    .reduce((s, c) => s + c.ghs, 0)
  const cashAvailable = data.meta.openingCashGhs + cashIn - cashOut
  const balanceSpark = useMemo(() => {
    const dates = [...new Set(data.cash.map((c) => c.date))].sort()
    let bal = data.meta.openingCashGhs
    return dates.map((d) => {
      bal += data.cash
        .filter((c) => c.date === d)
        .reduce((s, c) => s + (c.kind.endsWith('_in') ? c.ghs : -c.ghs), 0)
      return bal
    })
  }, [data])
  const ledgerRows = [...monthCash]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((entry) => {
      const isIn = entry.kind.endsWith('_in')
      return { entry, isIn }
    })
  let ledgerBalance = data.meta.openingCashGhs
  const ledgerRunning = ledgerRows.map(({ entry, isIn }) => {
    ledgerBalance += isIn ? entry.ghs : -entry.ghs
    return { entry, isIn, running: ledgerBalance }
  })

  const openQuotes = data.quotes.filter((q) => q.status === 'sent')
  const openQuotesValue = openQuotes.reduce((s, q) => s + q.valueGhs, 0)
  const monthInquiries = data.inquiries.filter((i) => i.receivedOn.startsWith(monthPrefix))
  const newInquiries = data.inquiries.filter((i) => i.status === 'new')

  const stageStats = ORDER_STAGES.map((stage) => {
    const list = orders.filter((o) => o.stage === stage)
    const oldest = list
      .filter((o) => !o.completedOn)
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))[0]
    return {
      stage,
      count: list.length,
      value: list.reduce((s, o) => s + o.valueGhs, 0),
      oldestDays: oldest ? daysSince(oldest.receivedOn) : undefined,
    }
  })

  // Needs attention --------------------------------------------------------
  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = []
    for (const q of data.quotes.filter((q) => q.status === 'sent')) {
      const age = daysSince(q.sentOn)
      if (age >= 1) {
        const customer = data.customers.find((c) => c.id === q.customerId)
        items.push({
          key: `q-${q.id}`,
          tone: age >= 3 ? 'rose' : 'amber',
          icon: Clock,
          text: `${q.id} awaiting response from ${customer?.name ?? 'customer'} (${ghs(q.valueGhs)})`,
          age: `${age}d`,
          target: 'quotes',
        })
      }
    }
    for (const o of orders.filter((o) => o.stage === 'quoted')) {
      const age = daysSince(o.receivedOn)
      if (age >= 2) {
        items.push({
          key: `o-${o.id}`,
          tone: age >= 4 ? 'rose' : 'amber',
          icon: Wallet,
          text: `Order ${o.id} awaiting deposit (${ghs(o.valueGhs - o.depositGhs)})`,
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
        text: `${staleCount} prices older than ${PRICE_STALE_DAYS} days`,
        age: 'stale',
        target: 'compare',
      })
    }
    for (const c of data.customers) {
      if (!c.nextFollowUp) continue
      const due = -daysSince(c.nextFollowUp)
      if (due <= 0) {
        items.push({
          key: `f-${c.id}`,
          tone: due < 0 ? 'rose' : 'amber',
          icon: Users,
          text: `Follow-up due: ${c.name}`,
          age: due < 0 ? `${-due}d late` : 'today',
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
          text: `Inquiry from ${i.customerName} waiting ${age}d`,
          age: `${age}d`,
          target: 'customers',
        })
      }
    }
    const weight = { rose: 0, amber: 1, brand: 2 }
    return items.sort((a, b) => weight[a.tone] - weight[b.tone]).slice(0, 8)
  }, [data, orders])

  // Today ------------------------------------------------------------------
  const todayItems: { icon: LucideIcon; text: string; chip: string; chipTone: string }[] = []
  for (const o of orders) {
    if (!o.expectedDelivery) continue
    if (o.expectedDelivery !== todayStr && o.expectedDelivery !== tomorrowStr) continue
    if (o.stage !== 'ordered' && o.stage !== 'delivered') continue
    const customer = data.customers.find((c) => c.id === o.customerId)
    todayItems.push({
      icon: PackageSearch,
      text: `${o.id} delivery (${customer?.name ?? 'customer'})`,
      chip: o.expectedDelivery === todayStr ? 'today' : 'tomorrow',
      chipTone:
        o.expectedDelivery === todayStr
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
          : 'bg-subtle text-ink-soft',
    })
  }
  for (const c of data.customers) {
    if (c.nextFollowUp === todayStr) {
      todayItems.push({
        icon: Users,
        text: `Follow-up: ${c.name}`,
        chip: 'today',
        chipTone: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
      })
    }
  }
  for (const i of data.inquiries.filter((i) => i.receivedOn === todayStr)) {
    todayItems.push({
      icon: Bell,
      text: `New inquiry: ${i.customerName}`,
      chip: i.channel,
      chipTone: 'bg-subtle text-ink-soft',
    })
  }

  // Demand to delivery ------------------------------------------------------
  const quotesSentMonth = data.quotes.filter((q) => q.sentOn.startsWith(monthPrefix)).length
  const ordersMonth = orders.filter((o) => o.receivedOn.startsWith(monthPrefix)).length
  const deliveredMonth = orders.filter(
    (o) =>
      (o.stage === 'delivered' || o.stage === 'settled') &&
      (o.completedOn ?? '').startsWith(monthPrefix),
  ).length
  const demandSteps = [
    { label: 'Inquiries', value: monthInquiries.length },
    { label: 'Quotes sent', value: quotesSentMonth },
    { label: 'Orders', value: ordersMonth },
    { label: 'Delivered', value: deliveredMonth },
  ]

  return (
    <div className="space-y-5">
      {/* Welcome + month target */}
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-brand-600 dark:text-brand-400">
            AdensaOps
          </div>
          <h2 className="mt-1 text-lg font-bold text-ink">Welcome back!</h2>
          <p className="mt-1 text-sm text-ink-soft">
            You have{' '}
            <strong className="font-semibold text-ink">
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
            </strong>.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:border-l sm:border-line sm:pl-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              {monthName} target
            </div>
            {target > 0 ? (
              <>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {ghs(revenueMonth)}{' '}
                  <span className="font-normal text-ink-faint">of {ghs(target)}</span>
                </div>
                <div className="mt-2 h-2 w-48 rounded-full bg-track">
                  <div
                    className="h-2 rounded-full bg-brand-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, targetPct)}%` }}
                  />
                </div>
                <div
                  className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                    onPace ? 'text-brand-600 dark:text-brand-400' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {onPace ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {targetPct}% of target · {onPace ? 'ahead of pace' : 'behind pace'}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-ink-faint">No target set</div>
            )}
          </div>
          <button
            onClick={onGetStarted}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <Bell size={15} />
            Let's get started
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* Executive KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={TrendingUp}
          tone={SUCCESS_BLUE}
          label="Revenue"
          onClick={() => setKpiDetail('revenue')}
          value={ghs(revenueMonth)}
          sub={target > 0 ? `${ghs(target)} target for ${monthName}` : `Completed in ${monthName}`}
          trend={target > 0 ? { dir: onPace ? 'up' : 'down', label: onPace ? 'ahead of pace' : 'behind pace' } : undefined}
        />
        <StatCard
          icon={Wallet}
          tone="#2563eb"
          label="Cash available"
          onClick={() => setKpiDetail('cash')}
          value={ghs(cashAvailable)}
          sub={`GH¢${receivable.toLocaleString('en-GH')} receivable`}
          spark={balanceSpark}
        />
        <StatCard
          icon={PackageSearch}
          tone="#1d4ed8"
          label="Orders in motion"
          onClick={() => setKpiDetail('orders')}
          value={inMotion.length}
          sub={`GH¢${inMotionValue.toLocaleString('en-GH')} in play`}
        />
        <StatCard
          icon={Tag}
          tone="#0ea5e9"
          label="Open quotes"
          onClick={() => setKpiDetail('quotes')}
          value={openQuotes.length}
          sub={openQuotes.length > 0 ? `${ghs(openQuotesValue)} awaiting response` : 'None awaiting response'}
        />
        <StatCard
          icon={Bell}
          tone={ALERT_AMBER}
          label="Inquiries"
          onClick={() => setKpiDetail('inquiries')}
          value={monthInquiries.length}
          sub={`${newInquiries.length} awaiting reply`}
        />
      </div>

      {/* Order flow */}
      <ChartCard title="Order flow" sub="Draft to settled, by stage">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stageStats.map((st) => (
            <div key={st.stage} className="rounded-lg border border-line bg-subtle p-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STAGE_COLORS[st.stage] }}
                />
                <span className="truncate text-[11px] font-medium text-ink-soft">
                  {ORDER_STAGE_LABELS[st.stage]}
                </span>
              </div>
              <div className="mt-1 text-xl font-bold text-ink">{st.count}</div>
              <div className="text-[11px] text-ink-faint">
                {st.value > 0 ? ghs(st.value) : 'GH¢0'}
              </div>
              {st.oldestDays !== undefined && st.oldestDays >= 1 && (
                <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                  oldest {st.oldestDays}d
                </div>
              )}
            </div>
          ))}
        </div>
        {orders.length === 0 && (
          <p className="mt-3 text-[11px] text-ink-faint">No orders recorded yet.</p>
        )}
      </ChartCard>

      {/* Attention + Today */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="Needs attention"
          sub="Oldest items first"
          className="lg:col-span-2"
        >
          {attention.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing needs attention." />
          ) : (
            <div className="-mx-2 space-y-0.5">
              {attention.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.key}
                    onClick={() => onNavigate(item.target)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-subtle"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ATTENTION_TONE[item.tone]}`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.text}</span>
                    <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                      {item.age}
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-ink-faint" />
                  </button>
                )
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Today" sub={today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}>
          {todayItems.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nothing scheduled today." />
          ) : (
            <div className="space-y-2">
              {todayItems.map((item, i) => {
                const Icon = item.icon
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-subtle px-3 py-2"
                  >
                    <Icon size={15} className="shrink-0 text-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{item.text}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${item.chipTone}`}
                    >
                      {item.chip}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Cash timing + demand to delivery */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Cash timing" sub={`${monthName} to date`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Money in
              </div>
              <div className="mt-1 text-lg font-bold text-ink">{ghs(cashIn)}</div>
              <div className="text-[11px] text-ink-faint">
                {monthCash.filter((c) => c.kind.endsWith('_in')).length} entries
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Money out
              </div>
              <div className="mt-1 text-lg font-bold text-ink">{ghs(cashOut)}</div>
              <div className="text-[11px] text-ink-faint">
                {monthCash.filter((c) => c.kind.endsWith('_out')).length} entries
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-faint">
            <span>Net {ghs(cashIn - cashOut)}</span>
            <span>Opening {ghs(data.meta.openingCashGhs)}</span>
            <span>Available {ghs(cashAvailable)}</span>
            <span>Receivable {ghs(receivable)}</span>
          </div>
          {data.cash.length === 0 && (
            <p className="mt-3 text-[11px] text-ink-faint">No cash movements recorded yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Demand to delivery" sub="Inquiries through to completed orders">
          <div className="grid grid-cols-4 gap-2 text-center">
            {demandSteps.map((s) => (
              <div key={s.label} className="rounded-lg bg-subtle p-3">
                <div className="text-xl font-bold text-ink">{s.value}</div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          {data.inquiries.length === 0 && (
            <p className="mt-3 text-[11px] text-ink-faint">No inquiries recorded yet.</p>
          )}
        </ChartCard>
      </div>

      {/* Supplier network */}
      <ChartCard title="Supplier network" sub="Where the pipeline sits across Ghana">
        <SupplierMap suppliers={data.suppliers} height={300} />
        <MapLegend />
      </ChartCard>

      {/* KPI drill-down */}
      {kpiDetail && (
        <KpiDetailModal
          title={
            kpiDetail === 'revenue'
              ? `Revenue account · ${monthName}`
              : kpiDetail === 'cash'
                ? `Cash ledger · ${monthName}`
                : kpiDetail === 'orders'
                  ? 'Orders in motion'
                  : kpiDetail === 'quotes'
                    ? 'Open quotes awaiting response'
                    : `Inquiries · ${monthName}`
          }
          sub={
            kpiDetail === 'revenue'
              ? 'Every completed order building this month’s revenue'
              : kpiDetail === 'cash'
                ? 'Opening balance and every cash movement this month'
                : kpiDetail === 'orders'
                  ? 'Deposits paid through to delivery: what is still owed to us'
                  : kpiDetail === 'quotes'
                    ? 'Quotes sent that the customer has not yet answered'
                    : 'Every request that came in this month, by channel'
          }
          onClose={() => setKpiDetail(null)}
          footer={
            kpiDetail === 'quotes' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Open the quote builder to follow up, revise or convert a quote.</span>
                <button
                  onClick={() => {
                    setKpiDetail(null)
                    onNavigate('quotes')
                  }}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700"
                >
                  Open quote builder
                </button>
              </div>
            ) : kpiDetail === 'inquiries' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>The customers page keeps every enquiry and follow-up in one place.</span>
                <button
                  onClick={() => {
                    setKpiDetail(null)
                    onNavigate('customers')
                  }}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700"
                >
                  Open customers
                </button>
              </div>
            ) : kpiDetail === 'cash' ? (
              'The cash tracker page ships with the sprint; this ledger is the live view until then.'
            ) : kpiDetail === 'orders' ? (
              'The full order pipeline page ships with the sprint; this is everything in motion today.'
            ) : (
              `Revenue counts orders completed in ${monthName}. Cash received covers deposits and balance payments recorded against each order.`
            )
          }
        >
          {kpiDetail === 'revenue' &&
            (revenueDetail.length === 0 ? (
              <DetailEmpty
                text={`No completed orders in ${monthName} yet. Revenue appears here as soon as an order is delivered or settled.`}
              />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Revenue', value: ghs(revenueDetailTotals.value) },
                    { label: 'Cash received', value: ghs(revenueDetailTotals.cash) },
                    { label: 'Still to collect', value: ghs(revenueDetailTotals.outstanding) },
                    { label: 'Completed orders', value: String(revenueDetail.length) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Order' },
                    { label: 'Customer' },
                    { label: 'Completed' },
                    { label: 'Value', right: true },
                    { label: 'Cash received', right: true },
                    { label: 'Still to collect', right: true },
                  ]}
                  rows={revenueDetail.map((r) => ({
                    key: r.order.id,
                    cells: [
                      <span key="id" className="whitespace-nowrap font-medium">{r.order.id}</span>,
                      <span key="cus" className="text-ink-soft">{r.customer}</span>,
                      <span key="date" className="whitespace-nowrap text-ink-soft">
                        {r.order.completedOn ? fmtDay(r.order.completedOn) : ''}
                      </span>,
                      <span key="v">{ghs(r.order.valueGhs)}</span>,
                      <span key="c" className="text-brand-600 dark:text-brand-400">{ghs(r.cashReceived)}</span>,
                      <span
                        key="o"
                        className={r.outstanding > 0 ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-ink-faint'}
                      >
                        {r.outstanding > 0 ? ghs(r.outstanding) : 'Settled'}
                      </span>,
                    ],
                  }))}
                />
              </>
            ))}

          {kpiDetail === 'cash' &&
            (ledgerRunning.length === 0 ? (
              <DetailEmpty text="No cash movements recorded yet. Every deposit and payment will appear here as a running ledger." />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Opening', value: ghs(data.meta.openingCashGhs) },
                    { label: 'Money in', value: ghs(cashIn) },
                    { label: 'Money out', value: ghs(cashOut) },
                    { label: 'Available', value: ghs(cashAvailable) },
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
                  rows={ledgerRunning.map(({ entry, isIn, running }) => ({
                    key: entry.id,
                    cells: [
                      <span key="d" className="whitespace-nowrap text-ink-soft">{fmtDay(entry.date)}</span>,
                      <span key="l">
                        <span className="block">{entry.label}</span>
                        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                          {CASH_KIND_LABELS[entry.kind]}
                        </span>
                      </span>,
                      <span key="i" className={isIn ? 'font-semibold text-brand-600 dark:text-brand-400' : ''}>
                        {isIn ? ghs(entry.ghs) : ''}
                      </span>,
                      <span key="o" className={isIn ? '' : 'font-semibold text-ink'}>
                        {isIn ? '' : ghs(entry.ghs)}
                      </span>,
                      <span key="b" className="text-ink-soft">{ghs(running)}</span>,
                    ],
                  }))}
                />
              </>
            ))}

          {kpiDetail === 'orders' &&
            (inMotionRows.length === 0 ? (
              <DetailEmpty text="No orders in motion. Orders appear here from the moment a deposit is paid until delivery." />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Orders', value: String(inMotionRows.length) },
                    { label: 'Value in play', value: ghs(inMotionValue) },
                    { label: 'Received so far', value: ghs(inMotion.reduce((s, o) => s + o.depositGhs, 0)) },
                    { label: 'Still to collect', value: ghs(receivable) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Order' },
                    { label: 'Customer' },
                    { label: 'Stage' },
                    { label: 'Value', right: true },
                    { label: 'Deposit', right: true },
                    { label: 'Outstanding', right: true },
                    { label: 'Age', right: true },
                  ]}
                  rows={inMotionRows.map(({ order, customer, outstanding, days }) => ({
                    key: order.id,
                    cells: [
                      <span key="id" className="whitespace-nowrap font-medium">{order.id}</span>,
                      <span key="cus" className="text-ink-soft">{customer}</span>,
                      <span key="st" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: STAGE_COLORS[order.stage] }}
                        />
                        {ORDER_STAGE_LABELS[order.stage]}
                      </span>,
                      <span key="v">{ghs(order.valueGhs)}</span>,
                      <span key="dep" className="text-ink-soft">{ghs(order.depositGhs)}</span>,
                      <span
                        key="out"
                        className={outstanding > 0 ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-ink-faint'}
                      >
                        {ghs(outstanding)}
                      </span>,
                      <span key="age" className="whitespace-nowrap text-ink-soft">{days}d</span>,
                    ],
                  }))}
                />
              </>
            ))}

          {kpiDetail === 'quotes' &&
            (openQuotes.length === 0 ? (
              <DetailEmpty text="No quotes awaiting a response. Sent quotes appear here until the customer accepts or declines." />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'Awaiting response', value: String(openQuotes.length) },
                    { label: 'Value quoted', value: ghs(openQuotesValue) },
                    { label: 'Oldest waiting', value: `${Math.max(...openQuotes.map((q) => daysSince(q.sentOn)))}d` },
                    { label: 'Worth chasing', value: String(openQuotes.filter((q) => daysSince(q.sentOn) >= 3).length) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Quote' },
                    { label: 'Customer' },
                    { label: 'Sent' },
                    { label: 'Value', right: true },
                    { label: 'Waiting', right: true },
                  ]}
                  rows={[...openQuotes]
                    .sort((a, b) => a.sentOn.localeCompare(b.sentOn))
                    .map((q) => {
                      const age = daysSince(q.sentOn)
                      const customer = data.customers.find((c) => c.id === q.customerId)?.name ?? 'Customer'
                      return {
                        key: q.id,
                        cells: [
                          <span key="id" className="whitespace-nowrap font-medium">{q.id}</span>,
                          <span key="cus" className="text-ink-soft">{customer}</span>,
                          <span key="sent" className="whitespace-nowrap text-ink-soft">{fmtDay(q.sentOn)}</span>,
                          <span key="v">{ghs(q.valueGhs)}</span>,
                          <span
                            key="w"
                            className={age >= 3 ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-ink-soft'}
                          >
                            {age}d{age >= 3 ? ' · chase' : ''}
                          </span>,
                        ],
                      }
                    })}
                />
              </>
            ))}

          {kpiDetail === 'inquiries' &&
            (monthInquiries.length === 0 ? (
              <DetailEmpty text={`No inquiries recorded in ${monthName} yet.`} />
            ) : (
              <>
                <DetailTotals
                  items={[
                    { label: 'This month', value: String(monthInquiries.length) },
                    { label: 'Awaiting reply', value: String(newInquiries.length) },
                    {
                      label: 'Quoted or won',
                      value: String(monthInquiries.filter((i) => i.status === 'quoted' || i.status === 'converted').length),
                    },
                    { label: 'Closed', value: String(monthInquiries.filter((i) => i.status === 'closed').length) },
                  ]}
                />
                <DetailTable
                  columns={[
                    { label: 'Customer' },
                    { label: 'Request' },
                    { label: 'Channel' },
                    { label: 'Received' },
                    { label: 'Status', right: true },
                  ]}
                  rows={[...monthInquiries]
                    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))
                    .map((i) => ({
                      key: i.id,
                      cells: [
                        <span key="cus" className="whitespace-nowrap font-medium">{i.customerName}</span>,
                        <span key="req">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              color: CATEGORY_COLORS[i.category],
                              backgroundColor: `color-mix(in srgb, ${CATEGORY_COLORS[i.category]} 14%, transparent)`,
                            }}
                          >
                            {CATEGORY_SHORT[i.category]}
                          </span>
                          <span className="mt-1 block max-w-[260px] truncate text-ink-soft" title={i.description}>
                            {i.description}
                          </span>
                        </span>,
                        <span key="ch" className="whitespace-nowrap text-ink-soft">{i.channel}</span>,
                        <span key="rec" className="whitespace-nowrap text-ink-soft">{fmtDay(i.receivedOn)}</span>,
                        <span
                          key="st"
                          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${INQUIRY_STATUS_TONE[i.status]}`}
                        >
                          {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                        </span>,
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

/* --------------------------------- Suppliers ---------------------------------- */

