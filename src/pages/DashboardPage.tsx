import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  MapPin,
  PackageSearch,
  Search,
  type LucideIcon,
  Users,
  Wallet,
} from 'lucide-react'
import type { DataMode, Dataset } from '../lib/dataSource'
import type { NotificationTarget } from '../lib/notifications'
import { CATEGORY_COLORS, CATEGORY_SHORT } from '../lib/colors'
import { EmptyState } from '../components/states'
import { SupplierMap } from '../components/SupplierMap'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
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
  fmtDay,
  ghs,
  localIso,
} from './shared'

type ScheduleKind = 'delivery' | 'followup' | 'inquiry'

/** Chip tint per schedule kind. Meaning is never colour-alone: every chip
 *  also spells the kind out in words. */
const SCHEDULE_TONE: Record<ScheduleKind, string> = {
  delivery: 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300',
  followup: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  inquiry: 'bg-subtle text-ink-soft dark:bg-subtle',
}

/** Flat panel shell for the dashboard — tone over borders: a whisper of
 *  shadow on light, a charcoal ring in dark. Never nested. */
function Panel({
  icon: Icon,
  title,
  sub,
  action,
  children,
  className = '',
}: {
  icon?: LucideIcon
  title: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl bg-surface p-4 shadow-[0_1px_3px_rgba(23,23,23,0.05)] sm:p-5 dark:shadow-none dark:ring-1 dark:ring-white/[0.06] ${className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
              <Icon size={14} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="mt-3 min-w-0 flex-1">{children}</div>
    </section>
  )
}

export function DashboardPage({
  data,
  mode,
  unreadCount,
  onOpenSearch,
  onNavigate,
}: {
  data: Dataset
  mode: DataMode
  unreadCount: number
  onOpenSearch: () => void
  onNavigate: (target: NotificationTarget) => void
}) {
  const monthPrefix = data.meta.month
  const monthName = new Date(`${monthPrefix}-01T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
  })
  const [kpiDetail, setKpiDetail] = useState<KpiDetailKey | null>(null)
  const [briefingOpen, setBriefingOpen] = useState(false)

  const today = new Date()
  const todayStr = localIso(today)

  const orders = data.orders

  // Money and orders -------------------------------------------------------
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

  // ---- Operational composition ------------------------------------------
  // Every figure below is computed from the same real records the rest of
  // the app uses — demo data in demo mode, PIN-gated records in real mode.
  // Nothing here is generated, estimated or hard-coded.
  const MS_DAY = 86_400_000
  const fullDate = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const modeLabel = mode === 'demo' ? 'Demo data' : 'PIN-protected real records'

  // Deliveries still outstanding: an expected date exists and the order has
  // not been delivered yet. Overdue = that date has already passed.
  const pendingDeliveries = orders.filter(
    (o) => o.expectedDelivery && (o.stage === 'deposit' || o.stage === 'ordered'),
  )
  const overdueDeliveries = pendingDeliveries.filter(
    (o) => (o.expectedDelivery ?? '') < todayStr,
  )
  const dueTodayDeliveries = pendingDeliveries.filter(
    (o) => o.expectedDelivery === todayStr,
  )
  const futureDeliveries = pendingDeliveries
    .filter((o) => (o.expectedDelivery ?? '') > todayStr)
    .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''))
  const nextDeliveryIso = futureDeliveries[0]?.expectedDelivery

  // Quotes waiting longest on the customer.
  const oldestWaiting =
    openQuotes.length > 0 ? Math.max(...openQuotes.map((q) => daysSince(q.sentOn))) : 0

  // Procurement spend = supplier payments recorded this month.
  const spendEntries = data.cash.filter(
    (c) => c.date.startsWith(monthPrefix) && c.kind === 'supplier_out',
  )
  const spendMonth = spendEntries.reduce((s, c) => s + c.ghs, 0)

  // Delivery performance: only COMPLETED orders that carried an expected
  // date can be measured — numerator and denominator are always shown and
  // an unmeasurable dataset renders an empty state, never a fake rate.
  const measuredDeliveries = orders.filter(
    (o) =>
      (o.stage === 'delivered' || o.stage === 'settled') && o.expectedDelivery && o.completedOn,
  )
  const onTimeDeliveries = measuredDeliveries.filter(
    (o) => (o.completedOn ?? '') <= (o.expectedDelivery ?? ''),
  )
  const onTimePct =
    measuredDeliveries.length > 0
      ? Math.round((onTimeDeliveries.length / measuredDeliveries.length) * 100)
      : 0

  // Operational activity: orders received per week, last 8 weeks, current
  // week highlighted. Real receivedOn dates only — empty data shows no bars.
  const mondayOffset = (today.getDay() + 6) % 7 // 0 = Monday
  const thisMonday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - mondayOffset,
  )
  const activityWeeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisMonday.getTime() - (7 - i) * 7 * MS_DAY)
    const end = new Date(start.getTime() + 7 * MS_DAY)
    const count = orders.filter((o) => {
      const t = new Date(`${o.receivedOn}T00:00:00`).getTime()
      return t >= start.getTime() && t < end.getTime()
    }).length
    return {
      key: `${i}-${start.getTime()}`,
      label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      count,
      current: i === 7,
    }
  })
  const activityMax = Math.max(...activityWeeks.map((w) => w.count), 1)
  const activityTotal = activityWeeks.reduce((s, w) => s + w.count, 0)

  // Dated commitments from today forward (deliveries + customer follow-ups):
  // the source for both the Upcoming agenda and the Daily Briefing.
  interface DatedItem {
    iso: string
    kind: ScheduleKind
    icon: LucideIcon
    text: string
    target: NotificationTarget
  }
  const datedItems: DatedItem[] = []
  for (const o of pendingDeliveries) {
    if (!o.expectedDelivery || o.expectedDelivery < todayStr) continue
    const customer = data.customers.find((c) => c.id === o.customerId)?.name ?? 'customer'
    datedItems.push({
      iso: o.expectedDelivery,
      kind: 'delivery',
      icon: PackageSearch,
      text: `${o.id} delivery · ${customer}`,
      target: 'orders',
    })
  }
  for (const c of data.customers) {
    if (c.nextFollowUp && c.nextFollowUp >= todayStr) {
      datedItems.push({
        iso: c.nextFollowUp,
        kind: 'followup',
        icon: Users,
        text: `Follow-up · ${c.name}`,
        target: 'customers',
      })
    }
  }
  datedItems.sort((a, b) => a.iso.localeCompare(b.iso))
  const upcomingItems = datedItems.filter((d) => d.iso > todayStr).slice(0, 6)

  const dueTodayItems: DatedItem[] = [
    ...dueTodayDeliveries.map((o): DatedItem => {
      const customer = data.customers.find((c) => c.id === o.customerId)?.name ?? 'customer'
      return {
        iso: todayStr,
        kind: 'delivery',
        icon: PackageSearch,
        text: `${o.id} delivery · ${customer}`,
        target: 'orders',
      }
    }),
    ...data.customers
      .filter((c) => c.nextFollowUp === todayStr)
      .map((c): DatedItem => ({
        iso: todayStr,
        kind: 'followup',
        icon: Users,
        text: `Follow-up · ${c.name}`,
        target: 'customers',
      })),
    ...data.inquiries
      .filter((i) => i.receivedOn === todayStr)
      .map((i): DatedItem => ({
        iso: todayStr,
        kind: 'inquiry',
        icon: Bell,
        text: `New inquiry · ${i.customerName}`,
        target: 'customers',
      })),
  ]

  // Daily Briefing: a deterministic compile of today's records — never a
  // generated summary. Attention first (already oldest-first), then today,
  // then what is coming up.
  const briefingAttention = attention.slice(0, 5)
  const briefingUpcoming = upcomingItems.slice(0, 4)
  const briefingCount = briefingAttention.length + dueTodayItems.length

  // Four essential KPIs — lightweight metrics with click-throughs into the
  // existing drill-down modals / orders page. No boxes, no decoration.
  const kpis: {
    label: string
    value: string
    hint: string
    tone?: 'amber' | 'success'
    onClick: () => void
  }[] = [
    {
      label: 'Orders in motion',
      value: String(inMotion.length),
      hint: inMotion.length > 0 ? `${ghs(inMotionValue)} in play` : 'No orders in motion',
      onClick: () => setKpiDetail('orders'),
    },
    {
      label: 'Quotes awaiting',
      value: String(openQuotes.length),
      hint:
        openQuotes.length === 0
          ? 'All quotes answered'
          : `${ghs(openQuotesValue)} quoted · oldest ${oldestWaiting}d`,
      tone: oldestWaiting >= 3 ? 'amber' : undefined,
      onClick: () => setKpiDetail('quotes'),
    },
    {
      label: 'Deliveries due',
      value: String(dueTodayDeliveries.length + overdueDeliveries.length),
      hint:
        overdueDeliveries.length > 0
          ? `${overdueDeliveries.length} overdue`
          : dueTodayDeliveries.length > 0
            ? `${dueTodayDeliveries.length} due today`
            : nextDeliveryIso
              ? `Next ${new Date(`${nextDeliveryIso}T00:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                })}`
              : 'Nothing scheduled',
      tone: overdueDeliveries.length > 0 ? 'amber' : undefined,
      onClick: () => onNavigate('orders'),
    },
    {
      label: 'Procurement spend',
      value: ghs(spendMonth),
      hint:
        spendEntries.length === 0
          ? 'No supplier payments this month'
          : `${spendEntries.length} payment${spendEntries.length === 1 ? '' : 's'}${
              cashOut > 0 ? ` · ${Math.round((spendMonth / cashOut) * 100)}% of money out` : ''
            }`,
      onClick: () => setKpiDetail('cash'),
    },
  ]

  const stageMax = Math.max(...stageStats.map((s) => s.count), 1)

  return (
    <div className="space-y-5">
      {/* ===== Compact header + four essential KPIs ===== */}
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Operations overview</h2>
          <p className="mt-1 text-sm text-ink-faint">
            {fullDate} · {modeLabel} · {unreadCount} unread notification
            {unreadCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-7 gap-y-4 sm:gap-x-10">
          {kpis.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={k.onClick}
              className="group min-w-0 rounded-md px-1 py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {k.label}
              </div>
              <div className="num mt-0.5 text-2xl font-semibold text-ink transition-colors group-hover:text-brand-700 dark:group-hover:text-brand-400">
                {k.value}
              </div>
              <div
                className={`mt-0.5 flex items-center gap-1 text-[11px] ${
                  k.tone === 'amber'
                    ? 'text-amber-700 dark:text-amber-400'
                    : k.tone === 'success'
                      ? 'text-success'
                      : 'text-ink-faint'
                }`}
              >
                {k.tone === 'amber' && <AlertTriangle size={11} aria-hidden="true" />}
                {k.tone === 'success' && <CheckCircle2 size={11} aria-hidden="true" />}
                <span className="truncate">{k.hint}</span>
              </div>
            </button>
          ))}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search suppliers, products, customers, orders and quotes"
              title="Search · Ctrl+K"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong text-ink-soft transition hover:border-brand-400 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:border-brand-600 dark:hover:text-brand-400"
            >
              <Search size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('quotes')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface"
            >
              <FileText size={14} aria-hidden="true" />
              New quote
            </button>
          </div>
        </div>
      </section>

      {/* ===== First viewport: four operational views in one compact row ===== */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Panel icon={BarChart3} title="Order status" sub="Draft to settled, by stage">
            {stageStats.every((s) => s.count === 0) ? (
              <EmptyState
                icon={BarChart3}
                title="No orders recorded yet."
                hint="The pipeline fills in as quotes convert to orders."
              />
            ) : (
              <>
                <ul className="space-y-2.5">
                  {stageStats.map((st) => (
                    <li
                      key={st.stage}
                      title={`${ORDER_STAGE_LABELS[st.stage]}: ${st.count} order${
                        st.count === 1 ? '' : 's'
                      } · ${ghs(st.value)}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink-soft">
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: STAGE_COLORS[st.stage] }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{ORDER_STAGE_LABELS[st.stage]}</span>
                        </span>
                        <span className="num shrink-0 font-semibold text-ink">{st.count}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.round((st.count / stageMax) * 100)}%`,
                            backgroundColor: STAGE_COLORS[st.stage],
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-faint">
                  {orders.length} order{orders.length === 1 ? '' : 's'} in the pipeline ·{' '}
                  {ghs(orders.reduce((s, o) => s + o.valueGhs, 0))} total value
                </p>
              </>
            )}
          </Panel>

        <Panel
          icon={MapPin}
          title="Operations map"
          sub={
            data.suppliers.length === 0
              ? 'No location data to plot'
              : `${data.suppliers.length} supplier${data.suppliers.length === 1 ? '' : 's'} across Ghana`
          }
        >
          {data.suppliers.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No supplier locations yet."
              hint="The map fills in as soon as records carry an area or city."
            />
          ) : (
            <>
              <SupplierMap suppliers={data.suppliers} height={212} />
              <MapLegend />
            </>
          )}
        </Panel>

          <Panel icon={CheckCircle2} title="Delivery performance" sub="Completed orders with an expected date">
            {measuredDeliveries.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No measured deliveries yet."
                hint="The on-time rate appears once a dated order is completed."
              />
            ) : (
              <>
                <div className="relative mx-auto w-full max-w-[230px]">
                  <svg
                    viewBox="0 0 148 84"
                    className="w-full"
                    role="img"
                    aria-label={`On-time delivery: ${onTimeDeliveries.length} of ${measuredDeliveries.length} (${onTimePct}%)`}
                  >
                    <path
                      d="M 18 74 A 56 56 0 0 1 130 74"
                      fill="none"
                      stroke="var(--color-track)"
                      strokeWidth="11"
                      strokeLinecap="round"
                    />
                    {onTimePct > 0 && (
                      <path
                        d="M 18 74 A 56 56 0 0 1 130 74"
                        fill="none"
                        stroke="var(--color-brand-500)"
                        strokeWidth="11"
                        strokeLinecap="round"
                        strokeDasharray={`${(onTimePct / 100) * Math.PI * 56} ${Math.PI * 56}`}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-x-0 bottom-0 text-center">
                    <span className="num text-2xl font-semibold text-ink">{onTimePct}%</span>
                  </div>
                </div>
                <p className="mt-2 text-center text-[11px] text-ink-faint">
                  {onTimeDeliveries.length} of {measuredDeliveries.length} completed deliveries
                  arrived on time
                </p>
              </>
            )}
          </Panel>

          <Panel icon={PackageSearch} title="Procurement activity" sub="Orders received · last 8 weeks">
            {activityTotal === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No purchase orders recorded yet."
                hint="Weekly activity appears as soon as orders are received."
              />
            ) : (
              <>
                <div
                  role="img"
                  aria-label={`Purchase orders received per week, last 8 weeks: ${activityWeeks
                    .map((w) => `${w.label}, ${w.count}`)
                    .join('; ')}`}
                  className="flex h-28 items-end gap-1.5"
                >
                  {activityWeeks.map((w) => (
                    <div
                      key={w.key}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"
                    >
                      {w.count > 0 && (
                        <span
                          className={`num text-center text-[10px] font-semibold ${
                            w.current
                              ? 'text-brand-700 dark:text-brand-400'
                              : 'text-ink-faint'
                          }`}
                        >
                          {w.count}
                        </span>
                      )}
                      <div
                        title={`${w.label}: ${w.count} order${w.count === 1 ? '' : 's'}`}
                        className={`w-full rounded-t-sm transition-colors ${
                          w.current
                            ? 'bg-brand-500'
                            : 'bg-track hover:bg-line-strong dark:hover:bg-line-strong'
                        }`}
                        style={{
                          height: `${w.count === 0 ? 0 : 16 + (w.count / activityMax) * 50}%`,
                        }}
                      />
                      <span className="w-full truncate text-center text-[8px] text-ink-faint">
                        {w.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-[11px] text-ink-faint">
                  {activityTotal} order{activityTotal === 1 ? '' : 's'} in 8 weeks · current week
                  highlighted
                </p>
              </>
            )}
          </Panel>
      </div>

      {/* ===== Second row: quotes to action, agenda, and the briefing control ===== */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Panel
            className="lg:col-span-4"
            icon={FileText}
            title="Manage quotes"
            sub={openQuotes.length > 0 ? `${openQuotes.length} awaiting action` : undefined}
            action={
              <button
                type="button"
                onClick={() => onNavigate('quotes')}
                className="text-xs font-medium text-brand-700 transition hover:underline dark:text-brand-400"
              >
                View all quotes
              </button>
            }
          >
            {openQuotes.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No quotes awaiting action."
                hint="Sent quotes appear here until the customer replies."
              />
            ) : (
              <ul className="-mx-2">
                {[...openQuotes]
                  .sort((a, b) => a.sentOn.localeCompare(b.sentOn))
                  .slice(0, 3)
                  .map((q) => {
                    const age = daysSince(q.sentOn)
                    const customer =
                      data.customers.find((c) => c.id === q.customerId)?.name ?? 'Customer'
                    return (
                      <li key={q.id}>
                        <button
                          type="button"
                          onClick={() => onNavigate('quotes')}
                          className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-ink">
                              {q.id} · {customer}
                            </span>
                            <span className="num block text-[11px] text-ink-faint">
                              {ghs(q.valueGhs)}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-[11px] font-medium ${
                              age >= 3
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-ink-faint'
                            }`}
                          >
                            {age}d waiting
                          </span>
                          <ArrowRight
                            size={13}
                            aria-hidden="true"
                            className="shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100"
                          />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            )}
          </Panel>

        <Panel
          className="lg:col-span-5"
          icon={CalendarClock}
          title="Upcoming operations"
          sub="Dated commitments from today forward"
        >
          {upcomingItems.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled ahead."
              hint="Deliveries and follow-ups appear here as soon as they carry a date."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {upcomingItems.map((item, i) => {
                const Icon = item.icon
                const d = new Date(`${item.iso}T00:00:00`)
                const days = Math.round((d.getTime() - today.setHours(0, 0, 0, 0)) / MS_DAY)
                const dayLabel =
                  days === 0
                    ? 'Today'
                    : days === 1
                      ? 'Tomorrow'
                      : d.toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })
                const kindLabel =
                  item.kind === 'delivery' ? 'Delivery' : item.kind === 'followup' ? 'Follow-up' : 'Inquiry'
                return (
                  <li key={`${item.iso}-${i}`}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.target)}
                      className="group flex w-full items-center gap-3 rounded-lg bg-subtle px-3 py-2 text-left transition hover:bg-track focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-surface ring-1 ring-line">
                        <span className="num text-[11px] font-bold leading-none text-ink">
                          {d.getDate()}
                        </span>
                        <span className="text-[8px] uppercase leading-none text-ink-faint">
                          {d.toLocaleDateString('en-GB', { month: 'short' })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">
                          {item.text}
                        </span>
                        <span className="block text-[11px] text-ink-faint">
                          {dayLabel} · {kindLabel}
                        </span>
                      </span>
                      <Icon
                        size={14}
                        aria-hidden="true"
                        className={`shrink-0 ${
                          item.kind === 'delivery'
                            ? 'text-brand-600 dark:text-brand-400'
                            : item.kind === 'followup'
                              ? 'text-success'
                              : 'text-ink-faint'
                        }`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="order-first flex lg:order-none lg:col-span-3">
          <button
            type="button"
            onClick={() => setBriefingOpen(true)}
            aria-haspopup="dialog"
            className="group flex w-full items-center gap-3 rounded-xl bg-brand-500 px-4 py-4 text-left text-[#171717] transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:bg-brand-400 dark:text-[#111111] dark:hover:bg-brand-300 dark:focus-visible:ring-offset-canvas"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#171717]/10 dark:bg-[#111111]/15">
              <ClipboardList size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Daily briefing</span>
              <span className="block truncate text-xs opacity-80">
                Today&apos;s operational briefing ·{' '}
                {briefingCount > 0
                  ? `${briefingCount} item${briefingCount === 1 ? '' : 's'} need attention`
                  : 'all clear'}
              </span>
            </span>
            <ArrowRight
              size={16}
              aria-hidden="true"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </div>

      {/* ===== Daily Briefing: a deterministic compile of today's records ===== */}
      <Dialog open={briefingOpen} onOpenChange={setBriefingOpen}>
        <DialogContent className="grid-cols-[minmax(0,1fr)] max-h-[85vh] max-w-lg overflow-x-hidden overflow-y-auto">
          <DialogTitle className="text-base">Daily briefing</DialogTitle>
          <DialogDescription>
            Compiled from today&apos;s records · {fullDate} — a deterministic summary, nothing
            generated.
          </DialogDescription>

          <div className="space-y-4">
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Needs attention
              </h4>
              {briefingAttention.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-faint">
                  Nothing needs attention — no stale quotes, deposits or follow-ups.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {briefingAttention.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => {
                            setBriefingOpen(false)
                            onNavigate(item.target)
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${ATTENTION_TONE[item.tone]}`}
                          >
                            <Icon size={13} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-ink">
                            {item.text}
                          </span>
                          <span className="shrink-0 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                            {item.age}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Due today
              </h4>
              {dueTodayItems.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-faint">
                  Nothing is scheduled for today.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {dueTodayItems.map((item, i) => {
                    const Icon = item.icon
                    return (
                      <li key={`${item.kind}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setBriefingOpen(false)
                            onNavigate(item.target)
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          <Icon
                            size={14}
                            aria-hidden="true"
                            className={`shrink-0 ${
                              item.kind === 'delivery'
                                ? 'text-brand-600 dark:text-brand-400'
                                : item.kind === 'followup'
                                  ? 'text-success'
                                  : 'text-ink-faint'
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs text-ink">
                            {item.text}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SCHEDULE_TONE[item.kind]}`}
                          >
                            {item.kind === 'delivery'
                              ? 'Delivery'
                              : item.kind === 'followup'
                                ? 'Follow-up'
                                : 'Inquiry'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Upcoming
              </h4>
              {briefingUpcoming.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-faint">
                  No dated commitments on the horizon.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {briefingUpcoming.map((item, i) => {
                    const Icon = item.icon
                    const d = new Date(`${item.iso}T00:00:00`)
                    return (
                      <li key={`${item.iso}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setBriefingOpen(false)
                            onNavigate(item.target)
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          <Icon
                            size={14}
                            aria-hidden="true"
                            className="shrink-0 text-ink-faint"
                          />
                          <span className="min-w-0 flex-1 truncate text-xs text-ink">
                            {item.text}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium text-ink-soft">
                            {d.toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

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

