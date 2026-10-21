// AdensaOps — Cash tracker (Day 5).
//
// Business view: the Orders pipeline writes customer money in (deposits and
// balances); this page is where the other half of the ledger lands — supplier
// payments and expenses — and where the operator sees the whole truth:
//
//   1. How much cash is in the box right now?        → Available
//   2. What moved this month, and in what mix?       → In / Out / Net + donuts
//   3. Which customers still owe us money?           → Collections list
//   4. What happened, line by line, with a balance?  → Ledger
//
// Reconciliation rule: KPIs are scoped to the reporting month (meta.month) so
// they match the Dashboard's Cash timing card exactly. The ledger's running
// balance is computed over ALL entries in date order from the opening float —
// a bank statement never lies by omission, so filtering never renumbers it.

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Download,
  Plus,
  Search,
  Wallet,
} from 'lucide-react'
import type { Dataset } from '../lib/dataSource'
import { downloadReceiptPdf } from '../lib/invoice'
import type { NotificationTarget } from '../lib/notifications'
import { ALERT_AMBER, ALERT_ROSE, SUCCESS_BLUE } from '../lib/colors'
import { ChartCard, DonutChart, type DonutSlice } from '../components/charts'
import { EmptyState } from '../components/states'
import { Pager, SortableTh, paginate, sortRows, useSort, type SortState } from '../components/table'
import type { CashEntry, CashKind, Order } from '../types'
import { daysSince } from '../types'
import { localDate } from '../lib/localData'
import { Sparkline } from './shared'
import {
  CASH_KIND_LABELS,
  FilterChip,
  KpiDetailModal,
  StatCard,
  fmtDay,
  ghs,
} from './shared'

/** Money-in kinds compose the customer side; money-out the supplier side. */
const IN_KINDS: CashKind[] = ['deposit_in', 'balance_in']

const KIND_DOT: Record<CashKind, string> = {
  deposit_in: 'var(--color-brand-600)',
  balance_in: 'var(--color-brand-300)',
  supplier_out: 'var(--color-ink-soft)',
  expense_out: 'var(--color-ink-faint)',
}

type LedgerFilter = 'all' | CashKind
type RowSource = 'month' | 'all'

const inputCls =
  'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-300'
const labelCls = 'block text-[11px] font-medium text-ink-soft'

function isIn(kind: CashKind): boolean {
  return IN_KINDS.includes(kind)
}

/** Per-order cash received (all in-entries linked to it). */
function receivedByOrder(entries: CashEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of entries) {
    if (c.orderId && isIn(c.kind)) {
      map.set(c.orderId, (map.get(c.orderId) ?? 0) + c.ghs)
    }
  }
  return map
}

/* --------------------------- Record payment form --------------------------- */

function RecordPaymentForm({
  data,
  onAdd,
  onClose,
}: {
  data: Dataset
  onAdd: (entry: Omit<CashEntry, 'id'>, message: string) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<CashKind>('supplier_out')
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(localDate())
  const [orderId, setOrderId] = useState('')
  const [error, setError] = useState('')

  // Supplier payments may attach to an order (true cost per job); expenses
  // are general until the books say otherwise.
  const openOrders = data.orders.filter((o) => o.stage !== 'settled')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number.parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (label.trim().length === 0) {
      setError('Say what this payment was for — the ledger is only as good as its labels.')
      return
    }
    if (!date) {
      setError('Pick the date the money moved.')
      return
    }
    const entry: Omit<CashEntry, 'id'> = {
      date,
      kind,
      ghs: amt,
      label: label.trim(),
      ...(orderId ? { orderId } : {}),
    }
    const customer = orderId
      ? data.customers.find((c) => c.id === data.orders.find((o) => o.id === orderId)?.customerId)?.name
      : undefined
    onAdd(
      entry,
      `${ghs(amt)} ${kind === 'supplier_out' ? 'supplier payment' : 'expense'} recorded${
        customer ? ` for ${orderId} (${customer})` : ''
      }.`,
    )
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <span className={labelCls}>Type</span>
        <div className="mt-1.5 flex gap-2">
          {(
            [
              ['supplier_out', 'Supplier payment'],
              ['expense_out', 'Expense'],
            ] as [CashKind, string][]
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={`min-h-11 flex-1 rounded-lg border px-3 text-xs font-medium transition ${
                kind === value
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-line-strong bg-surface text-ink-soft hover:border-brand-400'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="cash-amt">
            Amount (GH¢)
          </label>
          <input
            id="cash-amt"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError('')
            }}
            inputMode="decimal"
            placeholder="e.g. 4800"
            className={`${inputCls} mt-1.5`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="cash-date">
            Paid on
          </label>
          <input
            id="cash-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputCls} mt-1.5`}
          />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="cash-label">
          What was it for?
        </label>
        <input
          id="cash-label"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            setError('')
          }}
          placeholder={kind === 'supplier_out' ? 'e.g. GHACEM stock, Coastal Cement Depot' : 'e.g. Delivery fuel'}
          className={`${inputCls} mt-1.5`}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="cash-order">
          Link to an order (optional{kind === 'expense_out' ? ' — supplier payments only benefit' : ''})
        </label>
        <select
          id="cash-order"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          disabled={kind === 'expense_out'}
          className={`${inputCls} mt-1.5 disabled:opacity-50`}
        >
          <option value="">No order — general</option>
          {openOrders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} · {data.customers.find((c) => c.id === o.customerId)?.name ?? 'Customer'} ·{' '}
              {ghs(o.valueGhs)}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-track"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
        >
          Record payment
        </button>
      </div>
    </form>
  )
}

/* --------------------------------- Page ---------------------------------- */

export function CashTrackerPage({
  data,
  onNavigate,
  onAddCash,
}: {
  data: Dataset
  onNavigate: (target: NotificationTarget) => void
  onAddCash: (entry: Omit<CashEntry, 'id'>, message: string) => void
}) {
  const monthPrefix = data.meta.month
  const monthName = new Date(`${monthPrefix}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long' })

  const [filter, setFilter] = useState<LedgerFilter>('all')
  const [source, setSource] = useState<RowSource>('month')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [recordOpen, setRecordOpen] = useState(false)
  const { sort, toggle } = useSort<'date' | 'kind' | 'amount' | 'balance'>()
  const [page, setPage] = useState(0)

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
  const allEntries = data.cash

  // KPI scope: the reporting month, matching the Dashboard exactly.
  const monthEntries = useMemo(
    () => allEntries.filter((c) => c.date.startsWith(monthPrefix)),
    [allEntries, monthPrefix],
  )
  const monthIn = monthEntries.filter((c) => isIn(c.kind)).reduce((s, c) => s + c.ghs, 0)
  const monthOut = monthEntries.filter((c) => !isIn(c.kind)).reduce((s, c) => s + c.ghs, 0)
  const available = data.meta.openingCashGhs + allEntries.reduce((s, c) => s + (isIn(c.kind) ? c.ghs : -c.ghs), 0)

  // Running balance: computed once over ALL entries in date order from the
  // opening float, then attached to each entry — filters hide rows, they
  // never renumber the balance.
  const withBalance = useMemo(() => {
    const ordered = [...allEntries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    let bal = data.meta.openingCashGhs
    return ordered.map((entry) => {
      bal += isIn(entry.kind) ? entry.ghs : -entry.ghs
      return { entry, running: bal }
    })
  }, [allEntries, data.meta.openingCashGhs])

  const customerName = (orderId: string | undefined): string => {
    if (!orderId) return ''
    const o = data.orders.find((x) => x.id === orderId)
    return o ? (data.customers.find((c) => c.id === o.customerId)?.name ?? '') : ''
  }

  const rows = useMemo(() => {
    const list = withBalance.filter(({ entry }) => {
      if (source === 'month' && !entry.date.startsWith(monthPrefix)) return false
      if (filter !== 'all' && entry.kind !== filter) return false
      if (!q) return true
      return (
        entry.label.toLowerCase().includes(q) ||
        (entry.orderId ?? '').toLowerCase().includes(q) ||
        customerName(entry.orderId).toLowerCase().includes(q) ||
        CASH_KIND_LABELS[entry.kind].toLowerCase().includes(q)
      )
    })
    return sortRows(list, sort as SortState | null, (r) =>
      sort?.key === 'date'
        ? r.entry.date
        : sort?.key === 'kind'
          ? r.entry.kind
          : sort?.key === 'amount'
            ? r.entry.ghs
            : r.running,
    )
  }, [withBalance, source, monthPrefix, filter, q, sort, data.orders, data.customers])

  useEffect(() => {
    setPage(0)
  }, [filter, source, query])

  // Composition donuts — the deposit-vs-balance split the Day-5 note promised.
  const inSlices: DonutSlice[] = [
    { name: 'Deposits', value: monthEntries.filter((c) => c.kind === 'deposit_in').reduce((s, c) => s + c.ghs, 0), color: 'var(--color-stage-ordered)' },
    { name: 'Balances', value: monthEntries.filter((c) => c.kind === 'balance_in').reduce((s, c) => s + c.ghs, 0), color: 'var(--color-stage-draft)' },
  ]
  const outSlices: DonutSlice[] = [
    { name: 'Suppliers', value: monthEntries.filter((c) => c.kind === 'supplier_out').reduce((s, c) => s + c.ghs, 0), color: '#334155' },
    { name: 'Expenses', value: monthEntries.filter((c) => c.kind === 'expense_out').reduce((s, c) => s + c.ghs, 0), color: '#94a3b8' },
  ]

  // Balance spark across the whole ledger (Dashboard parity).
  const spark = withBalance.map((r) => r.running)

  // Collections: customers still owe on live orders (money the box will see).
  const received = receivedByOrder(allEntries)
  const collections = data.orders
    .filter((o) => o.stage === 'deposit' || o.stage === 'ordered' || o.stage === 'delivered')
    .map((o: Order) => {
      const got = Math.min(received.get(o.id) ?? 0, o.valueGhs)
      return { order: o, got, owed: o.valueGhs - got }
    })
    .filter((r) => r.owed > 0)
    .sort((a, b) => b.owed - a.owed)

  return (
    <div className="space-y-5">
      {/* KPI row — reconciles with the Dashboard's Cash timing card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          tone={SUCCESS_BLUE}
          label="Available now"
          value={ghs(available)}
          sub={`Opening ${ghs(data.meta.openingCashGhs)} + all movements`}
        />
        <StatCard
          icon={ArrowDownLeft}
          tone="var(--color-brand-600)"
          label={`In · ${monthName}`}
          value={ghs(monthIn)}
          sub={`${monthEntries.filter((c) => isIn(c.kind)).length} customer payments`}
        />
        <StatCard
          icon={ArrowUpRight}
          tone={ALERT_AMBER}
          label={`Out · ${monthName}`}
          value={ghs(monthOut)}
          sub={`${monthEntries.filter((c) => !isIn(c.kind)).length} supplier & expense payments`}
        />
        <StatCard
          icon={Banknote}
          tone={ALERT_ROSE}
          label="Still to collect"
          value={ghs(collections.reduce((s, r) => s + r.owed, 0))}
          sub={`Across ${collections.length} delivered or moving orders`}
          alert={false}
        />
      </div>

      {/* Flow: balance trajectory + the two money mixes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Balance trajectory" sub="Opening float through today">
          <Sparkline data={spark} color="var(--color-brand-500)" />
          <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
            <span>{fmtDay(withBalance[0]?.entry.date ?? localDate())}</span>
            <span className="font-medium text-ink">{ghs(available)}</span>
            <span>{fmtDay(withBalance[withBalance.length - 1]?.entry.date ?? localDate())}</span>
          </div>
        </ChartCard>
        <ChartCard title="Money in" sub={`${monthName} · deposit vs balance`}>
          <DonutChart data={inSlices} centerLabel={ghs(monthIn)} />
        </ChartCard>
        <ChartCard title="Money out" sub={`${monthName} · supplier vs expense`}>
          <DonutChart data={outSlices} centerLabel={ghs(monthOut)} />
        </ChartCard>
      </div>

      {/* Collections — who to chase today */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Still to collect</h3>
            <p className="mt-0.5 text-xs text-ink-faint">Customer cash not yet in, oldest debt first</p>
          </div>
        </div>
        {collections.length === 0 ? (
          <EmptyState icon={Banknote} title="Nothing outstanding" hint="Every live order is fully covered by cash received." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-[10px] uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5 text-left font-medium">Order</th>
                  <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Received</th>
                  <th className="px-4 py-2.5 text-right font-medium">Owed</th>
                  <th className="px-4 py-2.5 text-left font-medium">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {collections.map(({ order, got, owed }) => (
                  <tr
                    key={order.id}
                    className="cursor-pointer border-b border-line transition last:border-0 hover:bg-subtle"
                    onClick={() => onNavigate('orders')}
                  >
                    <td className="num px-4 py-2.5 font-medium text-ink">{order.id}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-soft">
                      {customerName(order.id) || 'Customer'}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-ink-soft">{ghs(got)}</td>
                    <td className="num px-4 py-2.5 text-right font-semibold text-ink">{ghs(owed)}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-faint">{daysSince(order.receivedOn)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
            {(Object.keys(CASH_KIND_LABELS) as CashKind[]).map((k) => (
              <FilterChip
                key={k}
                active={filter === k}
                onClick={() => setFilter(filter === k ? 'all' : k)}
                label={CASH_KIND_LABELS[k]}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 lg:w-56">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => typeInSearch(e.target.value)}
                placeholder="Search ledger…"
                aria-label="Search cash entries"
                className={`${inputCls} min-h-11 pl-9`}
              />
            </div>
            <button
              type="button"
              onClick={() => setRecordOpen(true)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
            >
              <Plus size={14} aria-hidden="true" /> Record payment
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <span className="text-[11px] text-ink-faint">Scope:</span>
          <FilterChip active={source === 'month'} onClick={() => setSource('month')} label={monthName} />
          <FilterChip active={source === 'all'} onClick={() => setSource('all')} label="All time" />
        </div>

        {rows.length === 0 ? (
          allEntries.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No cash movements yet"
              hint="Customer deposits flow in automatically from the Orders pipeline. Record supplier payments and expenses as they happen."
              action={
                <button
                  type="button"
                  onClick={() => setRecordOpen(true)}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700"
                >
                  Record the first payment
                </button>
              }
            />
          ) : (
            <EmptyState
              title="Nothing matches"
              hint="No ledger entries fit this filter or search."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all')
                    setSource('all')
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
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
                  <SortableTh label="Date" sortKey="date" sort={sort} onToggle={toggle} />
                  <SortableTh label="Kind" sortKey="kind" sort={sort} onToggle={toggle} />
                  <th scope="col" className="px-4 py-3 text-left">
                    Label
                  </th>
                  <SortableTh label="In" sortKey="amount" sort={sort} onToggle={toggle} align="right" />
                  <th scope="col" className="px-4 py-3 text-right">
                    Out
                  </th>
                  <SortableTh label="Balance" sortKey="balance" sort={sort} onToggle={toggle} align="right" />
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Receipt</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginate(rows, page).map(({ entry, running }) => (
                  <tr key={entry.id} className="border-b border-line transition last:border-0 hover:bg-subtle">
                    <td className="num whitespace-nowrap px-4 py-2.5 text-ink-soft">{entry.date}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: KIND_DOT[entry.kind] }}
                          aria-hidden="true"
                        />
                        {CASH_KIND_LABELS[entry.kind]}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-4 py-2.5">
                      <span className="block truncate text-ink">{entry.label}</span>
                      {entry.orderId && (
                        <span className="num text-[11px] text-ink-faint">
                          {entry.orderId}
                          {customerName(entry.orderId) ? ` · ${customerName(entry.orderId)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium text-ink">
                      {isIn(entry.kind) ? ghs(entry.ghs) : ''}
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium text-ink">
                      {!isIn(entry.kind) ? `−${ghs(entry.ghs)}` : ''}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-ink-soft">{ghs(running)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => downloadReceiptPdf(entry, data.orders, data.customers)}
                        aria-label={`Download receipt ${entry.id}`}
                        className="rounded-lg p-1.5 text-ink-faint transition hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        <Download size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && <Pager page={page} total={rows.length} onPage={setPage} noun="Ledger" />}
      </div>

      {recordOpen && (
        <KpiDetailModal title="Record a payment" sub="Supplier payments and expenses" onClose={() => setRecordOpen(false)}>
          <RecordPaymentForm data={data} onAdd={onAddCash} onClose={() => setRecordOpen(false)} />
        </KpiDetailModal>
      )}
    </div>
  )
}
