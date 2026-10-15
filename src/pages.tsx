import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  ChevronRight,
  Clock,
  MapPin,
  PackageSearch,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Dataset } from './lib/dataSource'
import type { NotificationTarget } from './lib/notifications'
import {
  ALERT_AMBER,
  CATEGORY_COLORS,
  CATEGORY_SHORT,
  CHART_AXIS,
  CHART_GRID,
  CHART_LABEL,
  CHART_TOOLTIP_STYLE,
  CUSTOMER_TYPE_COLORS,
  STATUS_COLORS,
  SUCCESS_BLUE,
  SUCCESS_BLUE_SOFT,
} from './lib/colors'
import { ChartCard, CategoryBars, DonutChart, type DonutSlice } from './components/charts'
import { SupplierMap } from './components/SupplierMap'
import {
  CATEGORY_LABELS,
  ORDER_STAGES,
  ORDER_STAGE_LABELS,
  PRICE_STALE_DAYS,
  STATUS_LABELS,
  daysSince,
  isPriceStale,
  type CashKind,
  type Category,
  type InquiryStatus,
  type OrderStage,
  type ProspectStatus,
} from './types'

const CATEGORIES: Category[] = ['cement', 'plumbing', 'electrical', 'safety', 'tools']
const STATUSES: ProspectStatus[] = ['identified', 'contacted', 'vetted']

/** Minimum table width — inside overflow-x-auto so the PAGE never scrolls sideways. */
const TABLE_MIN_W = 'min-w-[680px]'

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
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
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
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {CATEGORY_SHORT[category]}
    </span>
  )
}

function Sparkline({ data, color = '#2563eb' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const w = 104
  const h = 30
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 6) - 3}`)
    .join(' ')
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="mt-2 shrink-0"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  alert,
  trend,
  spark,
  onClick,
  hint = 'View details',
}: {
  icon: LucideIcon
  tone: string
  label: string
  value: string | number
  sub?: string
  alert?: boolean
  trend?: { dir: 'up' | 'down'; label: string }
  spark?: number[]
  onClick?: () => void
  hint?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
          <div className={`num mt-1 text-2xl font-bold ${alert ? 'text-rose-600 dark:text-rose-400' : 'text-ink'}`}>
            {value}
          </div>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          <Icon size={18} />
        </div>
      </div>
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
      {trend && (
        <div
          className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
            trend.dir === 'up'
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          {trend.dir === 'up' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {trend.label}
        </div>
      )}
      {spark && <Sparkline data={spark} />}
      {onClick && (
        <div className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-ink-faint transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
          {hint}
          <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </>
  )
  if (!onClick) {
    return <div className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-sm">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label}. ${hint}`}
      className="group min-w-0 w-full rounded-xl border border-line bg-surface p-4 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 dark:hover:border-brand-700"
    >
      {body}
    </button>
  )
}

/* ------------------------------ KPI drill-down ------------------------------ */

type KpiDetailKey = 'revenue' | 'cash' | 'orders' | 'quotes' | 'inquiries'

const CASH_KIND_LABELS: Record<CashKind, string> = {
  deposit_in: 'Deposit received',
  balance_in: 'Balance received',
  supplier_out: 'Supplier payment',
  expense_out: 'Expense paid',
}

const INQUIRY_STATUS_TONE: Record<InquiryStatus, string> = {
  new: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  quoted: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
  converted: 'bg-subtle text-ink',
  closed: 'bg-subtle text-ink-faint',
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function DetailTotals({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border border-line bg-subtle px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{t.label}</div>
          <div className="num mt-0.5 text-sm font-bold text-ink">{t.value}</div>
        </div>
      ))}
    </div>
  )
}

function DetailTable({
  columns,
  rows,
}: {
  columns: { label: string; right?: boolean }[]
  rows: { key: string; cells: ReactNode[] }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-xs ${TABLE_MIN_W}`}>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.label}
                className={`px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint ${
                  c.right ? 'text-right' : ''
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={`px-2.5 py-2 align-top text-ink ${columns[i]?.right ? 'text-right tabular-nums' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailEmpty({ text }: { text: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center px-4 text-center text-xs text-ink-faint">
      {text}
    </div>
  )
}

export function KpiDetailModal({
  title,
  sub,
  onClose,
  footer,
  children,
}: {
  title: string
  sub?: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 px-4 py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 text-[11px] text-ink-soft">{footer}</div>}
      </div>
    </div>
  )
}

function MapLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {CATEGORIES.map((cat) => (
        <span key={cat} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS[cat] }}
          />
          {CATEGORY_LABELS[cat]}
        </span>
      ))}
      <span className="ml-auto text-[10px] text-ink-faint">
        Approximate area positions &middot; &copy; OpenStreetMap
      </span>
    </div>
  )
}

/* ---------------------------------- Dashboard --------------------------------- */

const STAGE_COLORS: Record<OrderStage, string> = {
  draft: 'var(--color-stage-draft)',
  quoted: 'var(--color-stage-quoted)',
  deposit: 'var(--color-stage-deposit)',
  ordered: 'var(--color-stage-ordered)',
  delivered: 'var(--color-stage-delivered)',
  settled: 'var(--color-stage-settled)',
}

const IN_MOTION_STAGES: OrderStage[] = ['deposit', 'ordered', 'delivered']

interface AttentionItem {
  key: string
  tone: 'rose' | 'amber' | 'brand'
  icon: LucideIcon
  text: string
  age: string
  target: NotificationTarget
}

const ATTENTION_TONE: Record<AttentionItem['tone'], string> = {
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

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
            <div className="flex h-24 items-center justify-center text-xs text-ink-faint">
              Nothing needs attention.
            </div>
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
            <div className="flex h-24 items-center justify-center text-xs text-ink-faint">
              Nothing scheduled today.
            </div>
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

export function SuppliersPage({ data }: { data: Dataset }) {
  const [filter, setFilter] = useState<'all' | Category>('all')

  const rows = data.suppliers.filter((s) => filter === 'all' || s.category === filter)

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

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className={`w-full text-left text-sm ${TABLE_MIN_W}`}>
          <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-ink-faint">
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
                  <td className="px-4 py-3 text-ink-soft">
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
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:text-ink'
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
      color: CUSTOMER_TYPE_COLORS[type] ?? '#60a5fa',
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

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className={`w-full text-left text-sm ${TABLE_MIN_W}`}>
          <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Products needed</th>
              <th className="px-4 py-3">Next follow-up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.customers.map((c) => (
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
            {data.customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-faint">
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
  if (!date) return <span className="text-ink-faint">N/A</span>
  const days = -daysSince(date)
  let chip = null
  if (days < 0) {
    chip = (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
        overdue
      </span>
    )
  } else if (days <= 7) {
    chip = (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        due in {days}d
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink">{date}</span>
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

  // Stacked unit + transport bars per supplier. Best row goes deep navy so
  // "the winner" reads instantly without leaving the blue family.
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
          <div className="flex h-48 items-center justify-center text-xs text-ink-faint">
            No price observations yet.
          </div>
        ) : (
          <div className="min-w-0">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradQuoted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
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
                  stroke="#2563eb"
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
                cursor={{ fill: 'rgba(96, 165, 250, 0.10)' }}
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
                  <Cell key={d.name} fill={d.best ? SUCCESS_BLUE : '#2563eb'} />
                ))}
              </Bar>
              <Bar dataKey="transport" name="transport" stackId="cost" radius={[0, 6, 6, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.best ? '#60a5fa' : SUCCESS_BLUE_SOFT} />
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
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Transport</th>
              <th className="px-4 py-3">Total delivered</th>
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
                <td className="px-4 py-3 text-ink">{ghs(quote.ghs)}</td>
                <td className="px-4 py-3 text-ink">
                  {quote.transportGhs === undefined
                    ? 'N/A'
                    : quote.transportGhs === 0
                      ? 'Free'
                      : ghs(quote.transportGhs)}
                </td>
                <td className="px-4 py-3 font-semibold text-ink">
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
            <div className="flex h-24 items-center justify-center text-xs text-ink-faint">
              No reference observations yet.
            </div>
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
    <div className="rounded-xl border border-dashed border-line-strong bg-surface p-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
        <Icon size={22} />
      </div>
      <div className="text-sm font-semibold text-ink">{title}: not built yet</div>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-soft">{note}</p>
      <div className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
        <Building2 size={12} />
        On the AdensaOps build roadmap
      </div>
    </div>
  )
}
