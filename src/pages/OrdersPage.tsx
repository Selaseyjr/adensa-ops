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
  Search,
  Send,
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
import { ghs, IN_MOTION_STAGES, KpiDetailModal, STAGE_COLORS, StatCard } from './shared'

const MIN_W = 'min-w-[880px]'

const inputCls =
  'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-300'
const labelCls = 'block text-[11px] font-medium text-ink-soft'

/** One action the operator can take for the order's current stage. */
type Panel = 'none' | 'deposit' | 'payment' | 'delivery' | 'settle'

function balanceOf(o: Order): number {
  return Math.max(0, o.valueGhs - o.depositGhs)
}

/** Late = promised date passed while we still owe the customer goods. */
function isLate(o: Order, today: string): boolean {
  if (o.stage !== 'deposit' && o.stage !== 'ordered') return false
  return !!o.expectedDelivery && o.expectedDelivery < today
}

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

/** Received-vs-contract bar — the cash position of one order at a glance. */
function DepositBar({ order }: { order: Order }) {
  const pct =
    order.valueGhs > 0 ? Math.min(100, Math.round((order.depositGhs / order.valueGhs) * 100)) : 0
  return (
    <div className="min-w-[130px]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? SUCCESS_BLUE : 'var(--color-brand-600)' }}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink-faint">
        {ghs(order.depositGhs)} of {ghs(order.valueGhs)} · {pct}%
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
  onNavigate,
  onOrderAction,
}: {
  data: Dataset
  onNavigate: (target: NotificationTarget) => void
  onOrderAction: (
    orderId: string,
    patch: OrderOverride,
    opts?: { cash?: Omit<CashEntry, 'id'>[]; message: string },
  ) => void
}) {
  const today = localDate()
  const [stageFilter, setStageFilter] = useState<OrderStage | 'all'>('all')
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
    const list = stageFilter === 'all' ? matched : matched.filter((o) => o.stage === stageFilter)
    return sortRows(list, sort as SortState | null, (o) =>
      sort?.key === 'id'
        ? o.id
        : sort?.key === 'customer'
          ? customerName(o, data.customers)
          : sort?.key === 'value'
            ? o.valueGhs
            : sort?.key === 'deposit'
              ? o.depositGhs
              : sort?.key === 'stage'
                ? ORDER_STAGES.indexOf(o.stage)
                : sort?.key === 'expected'
                  ? o.expectedDelivery
                  : daysSince(o.receivedOn),
    )
  }, [matched, stageFilter, sort, data.customers])

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
  }

  function show(o: Order) {
    setOpenId(o.id)
    setPanel('none')
    setAmountError('')
    setDelError('')
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
    const amt = parseAmount(amount, balanceOf(o))
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
        message: `GH¢${amt.toLocaleString('en-GH')} deposit recorded for ${o.id}.`,
      },
    )
    setPanel('none')
    setAmount('')
  }

  /** delivered → settled, or a part-payment while the balance is outstanding. */
  function submitBalance(o: Order) {
    const remaining = balanceOf(o)
    const amt = parseAmount(amount, remaining)
    if (amt === null) return
    const full = amt >= remaining - 0.001
    onOrderAction(
      o.id,
      full
        ? { stage: 'settled', depositGhs: o.valueGhs, completedOn: o.completedOn ?? localDate() }
        : { depositGhs: o.depositGhs + amt },
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
          ? `${o.id} settled in full — balance of GH¢${amt.toLocaleString('en-GH')} received.`
          : `GH¢${amt.toLocaleString('en-GH')} recorded — ${ghs(remaining - amt)} still due on ${o.id}.`,
      },
    )
    setPanel('none')
    setAmount('')
  }

  /** ordered → delivered: receipt & discrepancy capture (playbook Step 5). */
  function submitDelivery(o: Order) {
    if (condition !== 'complete' && delNote.trim().length === 0) {
      setDelError('Describe what was short or damaged — the discrepancy must not vanish.')
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
      { message: `${o.id} delivered — receipt captured${condition !== 'complete' ? ' with discrepancy' : ''}.` },
    )
    setPanel('none')
  }

  const open = openOrder
  const balance = open ? balanceOf(open) : 0
  const lateCount = data.orders.filter((o) => isLate(o, today)).length
  const inMotion = data.orders.filter((o) => IN_MOTION_STAGES.includes(o.stage))
  const awaitingDeposit = data.orders.filter((o) => o.stage === 'quoted')
  const balanceDue = data.orders
    .filter((o) => o.stage === 'deposit' || o.stage === 'ordered' || o.stage === 'delivered')
    .reduce((sum, o) => sum + balanceOf(o), 0)

  return (
    <div className="space-y-5">
      {/* KPI row — stacks on phones, four-up from lg */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Truck}
          tone={SUCCESS_BLUE}
          label="In motion"
          value={ghs(inMotion.reduce((s, o) => s + o.valueGhs, 0))}
          sub={`${inMotion.length} orders at deposit → delivered`}
        />
        <StatCard
          icon={Banknote}
          tone={ALERT_AMBER}
          label="Awaiting deposit"
          value={awaitingDeposit.length}
          sub={`${ghs(awaitingDeposit.reduce((s, o) => s + o.valueGhs, 0))} quoted, cash not yet in`}
        />
        <StatCard
          icon={Wallet}
          tone="var(--color-brand-600)"
          label="Balance due"
          value={ghs(balanceDue)}
          sub="Collect on or before delivery"
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
              ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
              : 'border-line bg-surface text-ink-soft hover:border-brand-300'
          }`}
        >
          <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">All stages</div>
          <div className="num text-lg font-bold">{matched.length}</div>
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
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
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
            {stageFilter !== 'all' && ` in ${ORDER_STAGE_LABELS[stageFilter]}`}
          </p>
        </div>

        {rows.length === 0 ? (
          data.orders.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No orders yet"
              hint="Orders open automatically when you accept a quote — or draft one now and start the pipeline."
              action={
                <button
                  type="button"
                  onClick={() => onNavigate('quotes')}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                  <SortableTh label="Age" sortKey="age" sort={sort} onToggle={toggle} align="right" />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const age = daysSince(o.receivedOn)
                  const late = isLate(o, today)
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b border-line transition last:border-0 hover:bg-subtle"
                      onClick={() => show(o)}
                    >
                      <td className="px-4 py-3">
                        <span className="num font-medium text-ink">{o.id}</span>
                        {o.receipt && o.receipt.condition !== 'complete' && (
                          <span className="ml-2 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            discrepancy
                          </span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-ink-soft">
                        {customerName(o, data.customers)}
                      </td>
                      <td className="num px-4 py-3 text-right font-medium text-ink">{ghs(o.valueGhs)}</td>
                      <td className="px-4 py-3">
                        <DepositBar order={o} />
                      </td>
                      <td className="px-4 py-3">
                        <StageChip stage={o.stage} />
                      </td>
                      <td className="px-4 py-3">
                        {o.expectedDelivery ? (
                          <span className="flex items-center gap-1.5 text-ink-soft">
                            {o.expectedDelivery}
                            {late && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                late
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
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
              <button
                type="button"
                onClick={() => downloadInvoicePdf(open, data.customers)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink transition hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Download size={13} aria-hidden="true" /> Invoice PDF
              </button>
            </span>
          }
        >
          <div className="space-y-5">
            <StageStepper current={open.stage} />

            {/* Money */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line bg-subtle p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Contract</div>
                <div className="num mt-0.5 text-base font-bold text-ink">{ghs(open.valueGhs)}</div>
              </div>
              <div className="rounded-lg border border-line bg-subtle p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Received</div>
                <div className="num mt-0.5 text-base font-bold text-ink">{ghs(open.depositGhs)}</div>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  balance === 0
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
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
                  {open.expectedDelivery ?? '—'}
                  {isLate(open, today) && (
                    <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      late
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">Delivered</div>
                <div className="mt-0.5 text-ink">{open.completedOn ?? '—'}</div>
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
                    : '—'}
                </div>
              </div>
            </div>

            {open.receipt && open.receipt.condition !== 'complete' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
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
                      Deposit received (GH¢) — up to {ghs(balance)} outstanding
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
                      className={`${inputCls} mt-1.5 ${amountError ? 'border-rose-400 focus:ring-rose-300' : ''}`}
                    />
                    {amountError && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{amountError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[25, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setAmount(String(Math.round(balanceOf(open) * pct * 0.01)))}
                        className="rounded-full border border-line-strong px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-brand-400 hover:text-brand-600"
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAmount(String(balanceOf(open)))}
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
                      className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                      Extra payment (GH¢) — {ghs(balance)} outstanding
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
                      className={`${inputCls} mt-1.5 ${amountError ? 'border-rose-400 focus:ring-rose-300' : ''}`}
                    />
                    {amountError && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{amountError}</p>}
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
                      className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                                ? 'border-brand-600 bg-brand-600 text-white'
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
                      className={`${inputCls} mt-1.5 resize-none ${delError ? 'border-rose-400 focus:ring-rose-300' : ''}`}
                    />
                    {delError && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{delError}</p>}
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
                      className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                      Balance received (GH¢) — {ghs(balance)} outstanding
                    </label>
                    <input
                      id="set-amt"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        setAmountError('')
                      }}
                      inputMode="decimal"
                      className={`${inputCls} mt-1.5 ${amountError ? 'border-rose-400 focus:ring-rose-300' : ''}`}
                    />
                    {amountError && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{amountError}</p>}
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
                      className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
                    >
                      Record payment
                    </button>
                  </div>
                </div>
              )}

              {panel === 'none' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 text-xs text-ink-soft">
                    {open.stage === 'draft' && 'Not yet sent. Move it to Quoted when the offer goes to the customer.'}
                    {open.stage === 'quoted' && 'Cash-flow rule: the deposit lands before we commit to a supplier.'}
                    {open.stage === 'deposit' &&
                      (open.depositGhs > 0
                        ? 'Deposit is in — safe to place the supplier order.'
                        : 'Playbook guard: no supplier order before the deposit is recorded.')}
                    {open.stage === 'ordered' && 'On arrival, capture the receipt — completeness or discrepancy.'}
                    {open.stage === 'delivered' &&
                      (balance > 0 ? 'Goods delivered. Collect the balance to close the order.' : 'Fully paid — close the order.')}
                    {open.stage === 'settled' && `Closed ${open.completedOn ?? ''} — receipt and cash both in.`}
                  </p>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {open.stage === 'draft' && (
                      <button
                        type="button"
                        onClick={() =>
                          onOrderAction(open.id, { stage: 'quoted' }, { message: `${open.id} marked as quoted.` })
                        }
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
                      >
                        <Send size={14} aria-hidden="true" /> Mark as quoted
                      </button>
                    )}
                    {open.stage === 'quoted' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPanel('deposit')
                          setAmount('')
                        }}
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
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
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                            setAmount(String(balanceOf(open)))
                          }}
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
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
                              { message: `${open.id} settled — cash complete.` },
                            )
                          }
                          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
                        >
                          <CheckCircle2 size={14} aria-hidden="true" /> Close order
                        </button>
                      ))}
                    {open.stage === 'settled' && (
                      <span className="flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
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
