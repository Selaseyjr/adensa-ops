// AdensaOps — Orders pipeline.
//
// Business view: this screen turns a sold promise into collected cash. Six
// stages, each with exactly one honest next step:
//
//   draft → quoted → deposit → ordered → delivered → settled
//
// Policy comes from the Master Playbook (Step 4): no supplier order before
// the customer's money is in (cash-flow protection), delivery is not "done"
// without a receipt, and an order is not closed until the balance is
// collected. Payment structures vary (full prepayment, deposits, trusted
// arrangements), so the money guards protect the flow without inventing a
// fixed deposit percentage.
//
// UX: the stage rail is also the filter; one modal per order carries the
// stepper, lines, money and the single primary action valid for that stage —
// never two competing buttons. Every mutation is undoable via toast, because
// stage moves get fat-fingered on a phone at a depot.

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import { downloadInvoicePdf } from '../lib/invoice'
import type { NotificationTarget } from '../lib/notifications'
import { ALERT_AMBER, ALERT_ROSE, SUCCESS_BLUE } from '../lib/colors'
import { EmptyState } from '../components/states'
import { Pager, SortableTh, paginate, sortRows, useSort, type SortState } from '../components/table'
import type { CashEntry } from '../types'
import {
  ORDER_STAGES,
  ORDER_STAGE_LABELS,
  daysSince,
  type Customer,
  type DeliveryCondition,
  type Order,
  type OrderStage,
} from '../types'
import type { OrderOverride } from '../lib/localData'
import { localDate } from '../lib/localData'
import { balanceDue, cashReceived, orderFlags, type RuleContext } from '../lib/rules'
import { computeMetrics } from '../lib/metrics'
import { ghs, KpiDetailModal, RuleFlagChips, STAGE_COLORS, StatCard } from './shared'

const MIN_W = 'min-w-[880px]'

const inputCls =
  'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-300'
const labelCls = 'block text-[11px] font-medium text-ink-soft'

/** One action the operator can take for the order's current stage. */
type Panel = 'none' | 'deposit' | 'payment' | 'delivery' | 'settle' | 'edit'

// Deposit plus recorded balance payments: what the customer has actually paid.
const paidOf = (o: Order, cash: CashEntry[]): number => cashReceived(o, cash)
const balanceOf = (o: Order, cash: CashEntry[]): number => balanceDue(o, cash)

function customerName(o: Order, customers: Customer[]): string {
  return customers.find((c) => c.id === o.customerId)?.name ?? 'Customer'
}

function StageChip({ stage }: { stage: OrderStage }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-soft">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: STAGE_COLORS[stage] }}
        aria-hidden="true"
      />
      {ORDER_STAGE_LABELS[stage]}
    </span>
  )
}

/** One editable row in the order Edit form. */
interface EditLine {
  key: number;
  description: string;
  qty: string;
  unitGhs: string;
}

/** Received-vs-contract bar — the cash position of one order at a glance. */
function DepositBar({ order, cash }: { order: Order; cash: CashEntry[] }) {
  const paid = paidOf(order, cash)
  const pct = order.valueGhs > 0 ? Math.min(100, Math.round((paid / order.valueGhs) * 100)) : 0
  return (
    <div className="min-w-[130px]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? SUCCESS_BLUE : 'var(--color-brand-600)' }}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink-faint">
        {ghs(paid)} of {ghs(order.valueGhs)} · {pct}%
      </div>
    </div>
  )
}

/** Six-dot progress: dark dot = done, ringed dot = here, hollow = ahead. */
function StageStepper({ current }: { current: OrderStage }) {
  const idx = ORDER_STAGES.indexOf(current)
  return (
    <div className="relative flex justify-between px-1 pb-1">
      <div className="absolute left-6 right-6 top-[7px] h-px bg-line" aria-hidden="true" />
      {ORDER_STAGES.map((st, i) => {
        const done = i < idx
        const here = i === idx
        return (
          <div key={st} className="relative flex min-w-0 flex-col items-center gap-1.5 bg-surface px-1">
            <span
              className={`block h-3.5 w-3.5 rounded-full border-2 ${
                done || here ? 'border-transparent' : 'border-line-strong bg-surface'
              } ${here ? 'ring-4 ring-brand-100 dark:ring-brand-900/60' : ''}`}
              style={done || here ? { backgroundColor: STAGE_COLORS[st] } : undefined}
              aria-hidden="true"
            />
            <span
              className={`text-center text-[9px] leading-tight sm:text-[10px] ${
                here ? 'font-semibold text-ink' : done ? 'text-ink-soft' : 'text-ink-faint'
              }`}
            >
              {ORDER_STAGE_LABELS[st]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function OrdersPage({
  data,
  openOrderId,
  onOpenOrderConsumed,
  onNavigate,
  onOrderAction,
}: {
  data: Dataset
  /** Order handed over from another page (quote builder View) to open at mount. */
  openOrderId?: string | null
  onOpenOrderConsumed?: () => void
  onNavigate: (target: NotificationTarget) => void
  onOrderAction: (
    orderId: string,
    patch: OrderOverride,
    opts?: { cash?: Omit<CashEntry, 'id'>[]; message: string },
  ) => void
}) {
  const today = localDate()
  const ruleCtx: RuleContext = { orders: data.orders, cash: data.cash, quotes: data.quotes, prices: data.prices }
  const [stageFilter, setStageFilter] = useState<OrderStage | 'all' | 'flagged'>('all')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const { sort, toggle } = useSort<'id' | 'customer' | 'value' | 'deposit' | 'stage' | 'expected' | 'age'>()
  const [page, setPage] = useState(0)

  // Open order + which money/delivery form (if any) is showing inside it.
  const [openId, setOpenId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')

  // Form fields
  const [amount, setAmount] = useState('')
  const [amountError, setAmountError] = useState('')
  const [delDate, setDelDate] = useState(today)
  const [condition, setCondition] = useState<DeliveryCondition>('complete')
  const [delNote, setDelNote] = useState('')
  const [delError, setDelError] = useState('')

  // Edit form (pre-approval corrections): draft copies of the order's
  // own fields; saving writes an override, cash records stay untouched.
  const [editLines, setEditLines] = useState<EditLine[]>([])
  const [editReceived, setEditReceived] = useState('')
  const [editExpected, setEditExpected] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState('')

  // Cross-page handoff: another page asked for this order's popup to open.
  useEffect(() => {
    if (!openOrderId) return
    if (data.orders.some((o) => o.id === openOrderId)) {
      setOpenId(openOrderId)
      setPanel('none')
    }
    onOpenOrderConsumed?.()
  }, [openOrderId, data.orders, onOpenOrderConsumed])

  // ?q= is the URL's search state (palette and shared links set it).
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
  // Search first (id, customer, line text, notes) — the rail then shows how
  // those matches distribute across stages, and the table follows the filter.
  const matched = useMemo(() => {
    return data.orders.filter((o) => {
      if (!q) return true
      return (
        o.id.toLowerCase().includes(q) ||
        customerName(o, data.customers).toLowerCase().includes(q) ||
        (o.notes ?? '').toLowerCase().includes(q) ||
        o.lines.some((l) => l.description.toLowerCase().includes(q))
      )
    })
  }, [data.orders, data.customers, q])

  const railCounts = useMemo(() => {
    const map = new Map<OrderStage, { count: number; value: number }>()
    for (const st of ORDER_STAGES) map.set(st, { count: 0, value: 0 })
    for (const o of matched) {
      const cell = map.get(o.stage)!
      cell.count += 1
      cell.value += o.valueGhs
    }
    return map
  }, [matched])

  const rows = useMemo(() => {
    const ctx: RuleContext = { orders: data.orders, cash: data.cash, quotes: data.quotes, prices: data.prices }
    const list =
      stageFilter === 'all'
        ? matched
        : stageFilter === 'flagged'
          ? matched.filter((o) => orderFlags(o, ctx, today).length > 0)
          : matched.filter((o) => o.stage === stageFilter)
    return sortRows(list, sort as SortState | null, (o) =>
      sort?.key === 'id'
        ? o.id
        : sort?.key === 'customer'
          ? customerName(o, data.customers)
          : sort?.key === 'value'
            ? o.valueGhs
            : sort?.key === 'deposit'
              ? paidOf(o, data.cash)
              : sort?.key === 'stage'
                ? ORDER_STAGES.indexOf(o.stage)
                : sort?.key === 'expected'
                  ? o.expectedDelivery
                  : daysSince(o.receivedOn),
    )
  }, [matched, stageFilter, sort, data.customers, data.orders, data.cash, data.quotes, data.prices, today])

  const pageRows = paginate(rows, page)

  // Keep the pager on page 0 whenever the result set changes shape.
  useEffect(() => {
    setPage(0)
  }, [stageFilter, query])

  const openOrder = openId ? (data.orders.find((o) => o.id === openId) ?? null) : null

  function closeOrder() {
    setOpenId(null)
    setPanel('none')
    setAmount('')
    setAmountError('')
    setDelDate(today)
    setCondition('complete')
    setDelNote('')
    setDelError('')
    setEditLines([])
    setEditReceived('')
    setEditExpected('')
    setEditNotes('')
    setEditError('')
  }

  function show(o: Order) {
    setOpenId(o.id)
    setPanel('none')
    setAmountError('')
    setDelError('')
  }

  /** Seed the Edit form from the order's current details. */
  function openEdit(o: Order) {
    setEditLines(
      o.lines.map((l, i) => ({
        key: i,
        description: l.description,
        qty: String(l.qty),
        unitGhs: String(l.unitGhs),
      })),
    )
    setEditReceived(o.receivedOn)
    setEditExpected(o.expectedDelivery ?? '')
    setEditNotes(o.notes ?? '')
    setEditError('')
    setPanel('edit')
  }

  function patchEditLine(key: number, patch: Partial<EditLine>) {
    setEditLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  /** Manager corrections before approval. Cash records are never touched:
      the new contract value may not dip below cash already received. */
  function submitEdit(o: Order) {
    const trimmed = editLines
      .map((l) => ({
        description: l.description.trim(),
        qty: Number.parseFloat(l.qty),
        unitGhs: Number.parseFloat(l.unitGhs),
      }))
      .filter((l) => l.description.length > 0)
    if (trimmed.length === 0) {
      setEditError('An order needs at least one line item.')
      return
    }
    for (const l of trimmed) {
      if (!Number.isFinite(l.qty) || l.qty <= 0) {
        setEditError(`Quantity for "${l.description}" must be greater than zero.`)
        return
      }
      if (!Number.isFinite(l.unitGhs) || l.unitGhs < 0) {
        setEditError(`Unit price for "${l.description}" cannot be negative.`)
        return
      }
    }
    if (!editReceived) {
      setEditError('The received date is required.')
      return
    }
    const valueGhs = trimmed.reduce((sum, l) => sum + l.qty * l.unitGhs, 0)
    if (valueGhs < o.depositGhs) {
      setEditError(
        `Contract value cannot fall below the ${ghs(o.depositGhs)} already received on this order.`,
      )
      return
    }
    setEditError('')
    onOrderAction(
      o.id,
      {
        lines: trimmed.map((l) => ({ description: l.description, qty: l.qty, unitGhs: l.unitGhs })),
        valueGhs,
        receivedOn: editReceived,
        expectedDelivery: editExpected.trim(),
        notes: editNotes.trim(),
      },
      { message: `${o.id} details updated · new contract value ${ghs(valueGhs)}.` },
    )
    setPanel('none')
  }

  function parseAmount(raw: string, max: number): number | null {
    const amt = Number.parseFloat(raw)
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError('Enter an amount greater than zero.')
      return null
    }
    if (amt > max + 0.001) {
      setAmountError(`Cannot exceed the outstanding ${ghs(max)}.`)
      return null
    }
    setAmountError('')
    return amt
  }

  /** quoted → deposit, or a top-up while still funding procurement. */
  function submitDeposit(o: Order, advance: boolean) {
    const amt = parseAmount(amount, balanceOf(o, data.cash))
    if (amt === null) return
    onOrderAction(
      o.id,
      advance ? { stage: 'deposit', depositGhs: o.depositGhs + amt } : { depositGhs: o.depositGhs + amt },
      {
        cash: [
          {
            date: localDate(),
            kind: 'deposit_in',
            ghs: amt,
            label: `Deposit for ${o.id} (${customerName(o, data.customers)})`,
            orderId: o.id,
          },
        ],
        message: `${ghs(amt)} deposit recorded for ${o.id}.`,
      },
    )
    setPanel('none')
    setAmount('')
  }

  /** delivered → settled, or a part-payment while the balance is outstanding. */
  function submitBalance(o: Order) {
    const remaining = balanceOf(o, data.cash)
    const amt = parseAmount(amount, remaining)
    if (amt === null) return
    const full = amt >= remaining - 0.001
    // depositGhs stays the confirmed deposit; later payments live only as
    // balance_in cash entries, so nothing is counted twice.
    onOrderAction(
      o.id,
      full && o.stage === 'delivered'
        ? { stage: 'settled', completedOn: o.completedOn ?? localDate() }
        : {},
      {
        cash: [
          {
            date: localDate(),
            kind: 'balance_in',
            ghs: amt,
            label: `Balance, ${o.id} (${customerName(o, data.customers)})`,
            orderId: o.id,
          },
        ],
        message: full
          ? `${o.id} paid in full. Balance of ${ghs(amt)} received.`
          : `${ghs(amt)} recorded. ${ghs(remaining - amt)} still due on ${o.id}.`,
      },
    )
    setPanel('none')
    setAmount('')
  }

  /** ordered → delivered: receipt & discrepancy capture (playbook Step 5). */
  function submitDelivery(o: Order) {
    if (condition !== 'complete' && delNote.trim().length === 0) {
      setDelError('Describe what was short or damaged.')
      return
    }
    if (!delDate) {
      setDelError('Pick the date the goods reached the customer.')
      return
    }
    setDelError('')
    onOrderAction(
      o.id,
      {
        stage: 'delivered',
        completedOn: delDate,
        receipt: { on: delDate, condition, ...(delNote.trim() ? { note: delNote.trim() } : {}) },
      },
      { message: `${o.id} delivered. Receipt captured${condition !== 'complete' ? ' with discrepancy' : ''}.` },
    )
    setPanel('none')
  }

  const open = openOrder
  const balance = open ? balanceOf(open, data.cash) : 0
  // KPI figures come from the shared metric definitions (lib/metrics.ts),
  // so they match the Dashboard and Cash pages exactly.
  const metrics = computeMetrics(data, today)
  const lateCount = metrics.orders.late.length
  const openFlags = open ? orderFlags(open, ruleCtx, today) : []
  const flaggedCount = matched.filter((o) => orderFlags(o, ruleCtx, today).length > 0).length

  return (
    <div className="space-y-5">
      {/* KPI row — stacks on phones, four-up from lg */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Truck}
          tone={SUCCESS_BLUE}
          label="Orders in motion"
          value={metrics.orders.inMotion.length}
          sub={`${ghs(metrics.orders.inMotionValue)} · deposit paid to delivered`}
        />
        <StatCard
          icon={Banknote}
          tone={ALERT_AMBER}
          label="Awaiting deposit"
          value={metrics.orders.awaitingDeposit.length}
          sub={`${ghs(metrics.orders.awaitingDepositValue)} accepted, deposit not yet in`}
        />
        <StatCard
          icon={Wallet}
          tone="var(--color-brand-600)"
          label="Still to collect"
          value={ghs(metrics.money.stillToCollect)}
          sub={
            metrics.money.overdueBalance > 0
              ? `${ghs(metrics.money.overdueBalance)} overdue after offloading`
              : 'Due before offloading'
          }
        />
        <StatCard
          icon={AlertTriangle}
          tone={ALERT_ROSE}
          label="Late deliveries"
          value={lateCount}
          sub={lateCount > 0 ? 'Past the promised date' : 'All promises on track'}
          alert={lateCount > 0}
        />
      </div>

      {/* Stage rail = pipeline summary + filter. Horizontally scrollable on phones. */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by stage">
        <button
          type="button"
          onClick={() => setStageFilter('all')}
          aria-pressed={stageFilter === 'all'}
          className={`min-h-11 min-w-[110px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${
            stageFilter === 'all'
              ? 'border-primary bg-primary text-on-primary shadow-sm'
              : 'border-line bg-surface text-ink-soft hover:border-brand-300'
          }`}
        >
          <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">All stages</div>
          <div className="num text-lg font-bold">{matched.length}</div>
        </button>
        <button
          type="button"
          onClick={() => setStageFilter(stageFilter === 'flagged' ? 'all' : 'flagged')}
          aria-pressed={stageFilter === 'flagged'}
          className={`min-h-11 min-w-[110px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${
            stageFilter === 'flagged'
              ? 'border-danger bg-danger text-white shadow-sm'
              : 'border-line bg-surface text-ink-soft hover:border-danger/40'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
            <AlertTriangle size={11} aria-hidden="true" />
            Rule breaks
          </div>
          <div className="num text-lg font-bold">{flaggedCount}</div>
        </button>
        {ORDER_STAGES.map((st) => {
          const cell = railCounts.get(st)!
          const active = stageFilter === st
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStageFilter(active ? 'all' : st)}
              aria-pressed={active}
              className={`min-h-11 min-w-[118px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                active
                  ? 'border-primary bg-primary text-on-primary shadow-sm'
                  : 'border-line bg-surface text-ink-soft hover:border-brand-300'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: active ? '#fff' : STAGE_COLORS[st] }}
                  aria-hidden="true"
                />
                {ORDER_STAGE_LABELS[st]}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="num text-lg font-bold">{cell.count}</span>
                <span className="num text-[10px] opacity-70">{ghs(cell.value)}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => typeInSearch(e.target.value)}
              placeholder="Search order, customer, item…"
              aria-label="Search orders"
              className={`${inputCls} min-h-11 pl-9`}
            />
          </div>
          <p className="shrink-0 text-xs text-ink-faint">
            {rows.length} {rows.length === 1 ? 'order' : 'orders'}
            {stageFilter === 'flagged'
              ? ' with rule breaks'
              : stageFilter !== 'all' && ` in ${ORDER_STAGE_LABELS[stageFilter]}`}
          </p>
        </div>

        {rows.length === 0 ? (
          data.orders.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No orders yet"
              hint="Accepted quotes open orders here."
              action={
                <button
                  type="button"
                  onClick={() => onNavigate('quotes')}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                >
                  Open quote builder
                </button>
              }
            />
          ) : (
            <EmptyState
              title="Nothing matches"
              hint="No orders fit this search or stage."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setStageFilter('all')
                    typeInSearch('')
                  }}
                  className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-subtle"
                >
                  Clear filters
                </button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${MIN_W} border-collapse text-sm`}>
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
                  <SortableTh label="Order" sortKey="id" sort={sort} onToggle={toggle} />
                  <SortableTh label="Customer" sortKey="customer" sort={sort} onToggle={toggle} />
                  <SortableTh label="Value" sortKey="value" sort={sort} onToggle={toggle} align="right" />
                  <SortableTh label="Cash received" sortKey="deposit" sort={sort} onToggle={toggle} />
                  <SortableTh label="Stage" sortKey="stage" sort={sort} onToggle={toggle} />
                  <SortableTh label="Promised" sortKey="expected" sort={sort} onToggle={toggle} />
                  <th className="px-4 py-3 text-left font-medium">Flags</th>
                  <SortableTh label="Age" sortKey="age" sort={sort} onToggle={toggle} align="right" />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const age = daysSince(o.receivedOn)
                  const flags = orderFlags(o, ruleCtx, today)
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b border-line transition last:border-0 hover:bg-subtle"
                      onClick={() => show(o)}
                    >
                      <td className="px-4 py-3">
                        <span className="num whitespace-nowrap font-medium text-ink">{o.id}</span>
                        {o.receipt && o.receipt.condition !== 'complete' && (
                          <span className="ml-2 inline-block rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            discrepancy
                          </span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-ink-soft">
                        {customerName(o, data.customers)}
                      </td>
                      <td className="num px-4 py-3 text-right font-medium text-ink">{ghs(o.valueGhs)}</td>
                      <td className="px-4 py-3">
                        <DepositBar order={o} cash={data.cash} />
                      </td>
                      <td className="px-4 py-3">
                        <StageChip stage={o.stage} />
                      </td>
                      <td className="px-4 py-3">
                        {o.expectedDelivery ? (
                          <span className="whitespace-nowrap text-ink-soft">{o.expectedDelivery}</span>
                        ) : (
                          <span className="text-ink-faint">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RuleFlagChips flags={flags} />
                      </td>
                      <td className="num px-4 py-3 text-right text-ink-soft">{age}d</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            show(o)
                          }}
                          aria-label={`Open ${o.id}`}
                          className="rounded-md p-1.5 text-ink-faint transition hover:bg-track hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          <ChevronRight size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && <Pager page={page} total={rows.length} onPage={setPage} noun="Orders" />}
      </div>

      {/* Order detail — stepper, lines, money, and the one valid next step */}
      {open && (
        <KpiDetailModal
          title={`${open.id} · ${customerName(open, data.customers)}`}
          sub={`Opened ${open.receivedOn} · ${open.lines.length} line${open.lines.length === 1 ? '' : 's'}`}
          onClose={closeOrder}
          footer={
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-success" aria-hidden="true" />
                Every stage change and payment can be undone from the toast.
              </span>
              <span className="flex items-center gap-2">
              {open.stage !== 'settled' && (
                <button
                  type="button"
                  onClick={() => openEdit(open)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink transition hover:border-brand-400 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 dark:hover:border-brand-600 dark:hover:text-brand-400"
                >
                  <Pencil size={13} aria-hidden="true" /> Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => downloadInvoicePdf(open, data.customers)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Download size={13} aria-hidden="true" /> Invoice PDF
              </button>
              </span>
            </span>
          }
        >
          <div className="space-y-5">
            <StageStepper current={open.stage} />

            {openFlags.length > 0 && (
              <ul className="space-y-1.5" aria-label="Rule checks">
                {openFlags.map((f) => (
                  <li
                    key={f.key}
                    className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                      f.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
                    }`}
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">{f.label}.</span> {f.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Money */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line bg-subtle p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Contract</div>
                <div className="num mt-0.5 text-base font-bold text-ink">{ghs(open.valueGhs)}</div>
              </div>
              <div className="rounded-lg border border-line bg-subtle p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Received</div>
                <div className="num mt-0.5 text-base font-bold text-ink">{ghs(paidOf(open, data.cash))}</div>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  balance === 0
                    ? 'border-success/40 bg-success-soft'
                    : 'border-line bg-subtle'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Balance due</div>
                <div className="num mt-0.5 text-base font-bold text-ink">{ghs(balance)}</div>
              </div>
            </div>

            {/* Lines */}
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle text-[10px] uppercase tracking-wide text-ink-faint">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Unit</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lines.map((l, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-ink-soft">{l.description}</td>
                      <td className="num px-3 py-2 text-right text-ink-soft">{l.qty}</td>
                      <td className="num px-3 py-2 text-right text-ink-soft">{ghs(l.unitGhs)}</td>
                      <td className="num px-3 py-2 text-right font-medium text-ink">
                        {ghs(l.qty * l.unitGhs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dates + receipt */}
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Received</div>
                <div className="mt-0.5 text-ink">{open.receivedOn}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Promised</div>
                <div className="mt-0.5 text-ink">
                  {open.expectedDelivery ?? 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Delivered</div>
                <div className="mt-0.5 text-ink">{open.completedOn ?? 'N/A'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Receipt</div>
                <div className="mt-0.5 text-ink">
                  {open.receipt
                    ? `${open.receipt.on} · ${
                        open.receipt.condition === 'complete'
                          ? 'complete'
                          : open.receipt.condition === 'short'
                            ? 'short delivery'
                            : 'damaged'
                      }`
                    : 'N/A'}
                </div>
              </div>
            </div>

            {open.receipt && open.receipt.condition !== 'complete' && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs text-warning">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <span className="font-medium">Discrepancy on delivery: </span>
                  {open.receipt.note ?? 'not described.'}
                </div>
              </div>
            )}

            {open.notes && (
              <p className="rounded-lg bg-subtle p-3 text-xs leading-relaxed text-ink-soft">
                <span className="font-medium text-ink">Note: </span>
                {open.notes}
              </p>
            )}

            {/* Action zone — exactly one path per stage */}
            <div className="rounded-lg border border-line bg-subtle p-4">
              {panel === 'deposit' && (
                <div className="space-y-3">
                  <div>
                    <label className={labelCls} htmlFor="dep-amt">
                      Deposit received (GH¢), up to {ghs(balance)} outstanding
                    </label>
                    <input
                      id="dep-amt"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        setAmountError('')
                      }}
                      inputMode="decimal"
                      placeholder="e.g. 8000"
                      className={`${inputCls} mt-1.5 ${amountError ? 'border-danger/40 focus:ring-danger/40' : ''}`}
                    />
                    {amountError && <p className="mt-1.5 text-xs text-danger">{amountError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[25, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setAmount(String(Math.round(balanceOf(open, data.cash) * pct * 0.01)))}
                        className="rounded-full border border-line-strong px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand-400 hover:text-brand-600"
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAmount(String(balanceOf(open, data.cash)))}
                      className="rounded-full border border-line-strong px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand-400 hover:text-brand-600"
                    >
                      Full balance
                    </button>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel('none')}
                      className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitDeposit(open, true)}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                    >
                      Record deposit
                    </button>
                  </div>
                </div>
              )}

              {panel === 'payment' && (
                <div className="space-y-3">
                  <div>
                    <label className={labelCls} htmlFor="pay-amt">
                      Extra payment (GH¢), {ghs(balance)} outstanding
                    </label>
                    <input
                      id="pay-amt"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        setAmountError('')
                      }}
                      inputMode="decimal"
                      placeholder="e.g. 5000"
                      className={`${inputCls} mt-1.5 ${amountError ? 'border-danger/40 focus:ring-danger/40' : ''}`}
                    />
                    {amountError && <p className="mt-1.5 text-xs text-danger">{amountError}</p>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel('none')}
                      className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitDeposit(open, false)}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                    >
                      Record payment
                    </button>
                  </div>
                </div>
              )}

              {panel === 'delivery' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="del-date">
                        Delivered on
                      </label>
                      <input
                        id="del-date"
                        type="date"
                        value={delDate}
                        onChange={(e) => setDelDate(e.target.value)}
                        className={`${inputCls} mt-1.5`}
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Condition</span>
                      <div className="mt-1.5 flex gap-1.5">
                        {(
                          [
                            ['complete', 'Complete'],
                            ['short', 'Short'],
                            ['damaged', 'Damaged'],
                          ] as [DeliveryCondition, string][]
                        ).map(([value, text]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setCondition(value)
                              setDelError('')
                            }}
                            aria-pressed={condition === value}
                            className={`min-h-11 flex-1 rounded-lg border px-2 text-xs font-medium transition ${
                              condition === value
                                ? 'border-primary bg-primary text-on-primary'
                                : 'border-line-strong bg-surface text-ink-soft hover:border-brand-400'
                            }`}
                          >
                            {text}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="del-note">
                      {condition === 'complete' ? 'Delivery note (optional)' : 'Discrepancy detail (required)'}
                    </label>
                    <textarea
                      id="del-note"
                      value={delNote}
                      onChange={(e) => {
                        setDelNote(e.target.value)
                        setDelError('')
                      }}
                      rows={2}
                      placeholder={
                        condition === 'complete'
                          ? 'e.g. Offloaded at site, confirmed by storekeeper'
                          : 'e.g. 8 of 30 bags torn; 2 helmets missing'
                      }
                      className={`${inputCls} mt-1.5 resize-none ${delError ? 'border-danger/40 focus:ring-danger/40' : ''}`}
                    />
                    {delError && <p className="mt-1.5 text-xs text-danger">{delError}</p>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel('none')}
                      className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitDelivery(open)}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                    >
                      Confirm delivery
                    </button>
                  </div>
                </div>
              )}

              {panel === 'settle' && (
                <div className="space-y-3">
                  <div>
                    <label className={labelCls} htmlFor="set-amt">
                      Balance received (GH¢), {ghs(balance)} outstanding
                    </label>
                    <input
                      id="set-amt"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        setAmountError('')
                      }}
                      inputMode="decimal"
                      className={`${inputCls} mt-1.5 ${amountError ? 'border-danger/40 focus:ring-danger/40' : ''}`}
                    />
                    {amountError && <p className="mt-1.5 text-xs text-danger">{amountError}</p>}
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      Paying the full balance settles the order; anything less keeps it open with the remainder due.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel('none')}
                      className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitBalance(open)}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                    >
                      Record payment
                    </button>
                  </div>
                </div>
              )}

              {panel === 'edit' && (
                <div className="space-y-4">
                  <p className="text-xs text-ink-soft">
                    Correct the order details before approval. Cash records stay
                    as they are; the contract value follows the lines below.
                  </p>

                  <div className="space-y-2">
                    <span className={labelCls}>Line items</span>
                    {editLines.map((l, i) => (
                      <div key={l.key} className="flex items-start gap-2">
                        <input
                          aria-label={`Item ${i + 1} description`}
                          value={l.description}
                          onChange={(e) => patchEditLine(l.key, { description: e.target.value })}
                          placeholder="Item"
                          className={`${inputCls} min-w-0 flex-1`}
                        />
                        <input
                          aria-label={`Item ${i + 1} quantity`}
                          value={l.qty}
                          onChange={(e) => patchEditLine(l.key, { qty: e.target.value })}
                          inputMode="decimal"
                          className={`${inputCls} w-20 text-right`}
                        />
                        <input
                          aria-label={`Item ${i + 1} unit price (GH¢)`}
                          value={l.unitGhs}
                          onChange={(e) => patchEditLine(l.key, { unitGhs: e.target.value })}
                          inputMode="decimal"
                          className={`${inputCls} w-28 text-right`}
                        />
                        <button
                          type="button"
                          onClick={() => setEditLines((ls) => ls.filter((x) => x.key !== l.key))}
                          aria-label={`Remove item ${i + 1}`}
                          className="mt-1.5 shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-track hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setEditLines((ls) => [
                          ...ls,
                          { key: Math.max(0, ...ls.map((l) => l.key)) + 1, description: '', qty: '1', unitGhs: '' },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:bg-track"
                    >
                      <Plus size={12} aria-hidden="true" /> Add item
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelCls} htmlFor="edit-received">
                        Received on
                      </label>
                      <input
                        id="edit-received"
                        type="date"
                        value={editReceived}
                        onChange={(e) => {
                          setEditReceived(e.target.value)
                          setEditError('')
                        }}
                        className={`${inputCls} mt-1.5`}
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="edit-expected">
                        Promised delivery
                      </label>
                      <input
                        id="edit-expected"
                        type="date"
                        value={editExpected}
                        onChange={(e) => {
                          setEditExpected(e.target.value)
                          setEditError('')
                        }}
                        className={`${inputCls} mt-1.5`}
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Contract value</span>
                      <div className="num mt-1.5 rounded-lg border border-line bg-subtle px-3 py-2 text-sm font-semibold text-ink">
                        {ghs(
                          editLines.reduce((sum, l) => {
                            const qty = Number.parseFloat(l.qty)
                            const unit = Number.parseFloat(l.unitGhs)
                            return sum + (Number.isFinite(qty) && Number.isFinite(unit) ? qty * unit : 0)
                          }, 0),
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls} htmlFor="edit-notes">
                      Note (optional)
                    </label>
                    <textarea
                      id="edit-notes"
                      value={editNotes}
                      onChange={(e) => {
                        setEditNotes(e.target.value)
                        setEditError('')
                      }}
                      rows={2}
                      placeholder="e.g. Customer confirmed the cable spec downgrade"
                      className={`${inputCls} mt-1.5 resize-none`}
                    />
                  </div>

                  {editError && <p className="text-xs text-danger">{editError}</p>}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel('none')}
                      className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => submitEdit(open)}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              )}

              {panel === 'none' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 text-xs text-ink-soft">
                    {open.stage === 'draft' &&
                      'Review the details (use Edit to fix anything), then approve it into the pipeline.'}
                    {open.stage === 'quoted' && 'Cash-flow rule: the deposit lands before we commit to a supplier.'}
                    {open.stage === 'deposit' &&
                      (open.depositGhs > 0
                        ? 'Deposit is in. Safe to place the supplier order.'
                        : 'Playbook guard: no supplier order before the deposit is recorded.')}
                    {open.stage === 'ordered' && 'Balance is due before offloading. Capture the receipt on arrival.'}
                    {open.stage === 'delivered' &&
                      (balance > 0 ? 'Goods delivered. Collect the balance to close the order.' : 'Fully paid. Close the order.')}
                    {open.stage === 'settled' && `Closed ${open.completedOn ?? ''}. Receipt and cash both in.`}
                  </p>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {open.stage === 'draft' && (
                      <button
                        type="button"
                        onClick={() =>
                          onOrderAction(open.id, { stage: 'quoted' }, { message: `${open.id} approved and marked as quoted.` })
                        }
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                      >
                        <CheckCircle2 size={14} aria-hidden="true" /> Approve order
                      </button>
                    )}
                    {open.stage === 'quoted' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPanel('deposit')
                          setAmount('')
                        }}
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                      >
                        <Banknote size={14} aria-hidden="true" /> Record deposit
                      </button>
                    )}
                    {open.stage === 'deposit' && (
                      <>
                        {balance > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPanel('payment')
                              setAmount('')
                            }}
                            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                          >
                            <Wallet size={14} aria-hidden="true" /> Record payment
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={open.depositGhs <= 0}
                          onClick={() =>
                            onOrderAction(open.id, { stage: 'ordered' }, { message: `${open.id} placed with supplier.` })
                          }
                          title={open.depositGhs <= 0 ? 'Record the deposit first' : undefined}
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Truck size={14} aria-hidden="true" /> Place supplier order
                        </button>
                      </>
                    )}
                    {open.stage === 'ordered' && (
                      <>
                        {balance > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPanel('payment')
                              setAmount('')
                            }}
                            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
                          >
                            <Wallet size={14} aria-hidden="true" /> Record payment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPanel('delivery')
                            setDelDate(today)
                            setCondition('complete')
                            setDelNote('')
                          }}
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                        >
                          <ClipboardCheck size={14} aria-hidden="true" /> Record delivery
                        </button>
                      </>
                    )}
                    {open.stage === 'delivered' &&
                      (balance > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPanel('settle')
                            setAmount(String(balanceOf(open, data.cash)))
                          }}
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                        >
                          <Banknote size={14} aria-hidden="true" /> Collect balance
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onOrderAction(
                              open.id,
                              { stage: 'settled', completedOn: open.completedOn ?? localDate() },
                              { message: `${open.id} settled. Cash complete.` },
                            )
                          }
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                        >
                          <CheckCircle2 size={14} aria-hidden="true" /> Close order
                        </button>
                      ))}
                    {open.stage === 'settled' && (
                      <span className="flex min-h-11 items-center gap-1.5 rounded-lg border border-success/40 bg-success-soft px-4 py-2 text-xs font-medium text-success">
                        <PackageCheck size={14} aria-hidden="true" /> Complete
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </KpiDetailModal>
      )}
    </div>
  )
}
