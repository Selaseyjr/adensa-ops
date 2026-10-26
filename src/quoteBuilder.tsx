import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Eye, FileText, Plus, Printer, Trash2, X } from 'lucide-react'
import type { DataMode } from './lib/dataSource'
import type { NotificationTarget } from './lib/notifications'
import { ALERT_AMBER } from './lib/colors'
import { KpiDetailModal } from './pages'
import {
  PRICE_STALE_DAYS,
  daysSince,
  quoteLineTotals,
  type Customer,
  type Order,
  type Quote,
  type QuoteLine,
  type QuoteStatus,
} from './types'
import { localDate, nextCustomerId } from './lib/localData'
import type { Dataset } from './lib/dataSource'
import { productLabel } from './lib/compare'
import { autoFillCost, quoteTotals, transportLoads } from './lib/quote'
import { DEPOSIT_RATE, PAYMENT_TERMS, QUOTE_VALIDITY_DAYS, requiredDeposit, requiredDepositRate } from './lib/rules'
import { AdensaLogo } from './components/brand'
import { formatCount, formatGhs } from './lib/format'

const ghs = formatGhs

function fmtLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const QUOTE_STATUS_STYLE: Record<QuoteStatus, { dot: string; label: string }> = {
  sent: { dot: 'var(--color-status-contacted)', label: 'Awaiting response' },
  accepted: { dot: 'var(--color-status-vetted)', label: 'Accepted' },
  declined: { dot: 'var(--color-ink-faint)', label: 'Declined' },
  expired: { dot: 'var(--color-ink-faint)', label: 'Expired' },
}

function QuoteStatusChip({ status }: { status: QuoteStatus }) {
  const s = QUOTE_STATUS_STYLE[status]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-soft">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  )
}

/* ------------------------------- Line editor ------------------------------- */

interface DraftLine {
  key: number
  /** Catalogue product; empty for a custom line. */
  productId: string
  description: string
  qty: string
  unitCost: string
  unitPrice: string
  /** Supplier whose best delivered price filled the cost. */
  supplierId?: string
  supplierName?: string
  transportGhs?: number
  /** Result of the last auto-fill, for the hint under the line. */
  fill?: 'priced' | 'stale' | 'none'
  deliveredPerUnit?: number
}

const MARKUPS = [10, 15, 20, 25, 30]

function num(s: string): number {
  const v = Number.parseFloat(s)
  return Number.isFinite(v) && v >= 0 ? v : 0
}

const emptyLine = (key: number): DraftLine => ({ key, productId: '', description: '', qty: '1', unitCost: '', unitPrice: '' })

type QuoteData = Pick<Dataset, 'customers' | 'products' | 'prices' | 'suppliers' | 'orders' | 'cash'>

/* ------------------------------ New quote form ----------------------------- */

function NewQuoteForm({
  data,
  mode,
  onClose,
  onCreate,
}: {
  data: QuoteData
  mode: DataMode
  onClose: () => void
  onCreate: (q: Quote, newCustomer: Customer | null) => void
}) {
  const [customerId, setCustomerId] = useState('')
  const [newCustomerMode, setNewCustomerMode] = useState(data.customers.length === 0)
  const [ncName, setNcName] = useState('')
  const [ncPhone, setNcPhone] = useState('')
  const [ncCity, setNcCity] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(0)])
  // Sell price per transport load, keyed by supplier (defaults to cost).
  const [transportCharge, setTransportCharge] = useState<Record<string, string>>({})
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(Date.now() + QUOTE_VALIDITY_DAYS * 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  /** Re-run the best-delivered pick for a catalogue line (product or qty changed). */
  function refill(l: DraftLine): DraftLine {
    if (!l.productId) return l
    const product = data.products.find((p) => p.id === l.productId)
    const res = autoFillCost(l.productId, Math.max(1, num(l.qty)), data.prices, data.suppliers)
    const base: DraftLine = { ...l, description: product ? productLabel(product) : l.description, fill: res.kind }
    if (res.kind !== 'priced') {
      return { ...base, supplierId: undefined, supplierName: undefined, transportGhs: undefined, deliveredPerUnit: undefined }
    }
    return {
      ...base,
      unitCost: String(res.pick.unitCostGhs),
      supplierId: res.pick.supplierId,
      supplierName: res.pick.supplierName,
      transportGhs: res.pick.transportGhs,
      deliveredPerUnit: res.pick.deliveredPerUnitGhs,
    }
  }

  function patchLine(key: number, patch: Partial<DraftLine>, recompute = false) {
    setLines((ls) => ls.map((l) => (l.key === key ? (recompute ? refill({ ...l, ...patch }) : { ...l, ...patch }) : l)))
  }

  /** Markup ladder: set every priced line's sell price from its cost. */
  function applyMarkup(pct: number) {
    setLines((ls) =>
      ls.map((l) => {
        const cost = num(l.unitCost)
        if (cost <= 0) return l
        return { ...l, unitPrice: String(Math.round(cost * (1 + pct / 100) * 100) / 100) }
      }),
    )
  }

  // Transport: one load per supplier the catalogue lines buy from.
  const loads = transportLoads(lines)
  const transportLines = loads.map((load) => {
    const charge = transportCharge[load.supplierId]
    return {
      ...load,
      chargeGhs: charge === undefined || charge === '' ? load.transportGhs : num(charge),
    }
  })

  const customer = data.customers.find((c) => c.id === customerId)
  const depositRate = customer && !newCustomerMode ? requiredDepositRate(customer.id, data.orders, data.cash) : DEPOSIT_RATE

  const totals = useMemo(
    () =>
      quoteTotals(
        [
          ...lines.map((l) => ({
            qty: num(l.qty),
            unitCostGhs: num(l.unitCost) > 0 ? num(l.unitCost) : undefined,
            unitPriceGhs: num(l.unitPrice),
          })),
          ...transportLines.map((t) => ({ qty: 1, unitCostGhs: t.transportGhs || undefined, unitPriceGhs: t.chargeGhs })),
        ],
        depositRate,
      ),
    [lines, transportLines, depositRate],
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!newCustomerMode && !customer) {
      setError('Choose the customer this quote is for.')
      return
    }
    if (newCustomerMode && ncName.trim().length === 0) {
      setError('Enter the customer name.')
      return
    }
    if (lines.some((l) => l.productId && l.fill === 'stale' && num(l.unitCost) === 0)) {
      setError('Re-check the stale supplier price, then enter the cost.')
      return
    }
    const goods = lines
      .filter((l) => l.description.trim().length > 0 && num(l.qty) > 0 && num(l.unitPrice) > 0)
      .map<QuoteLine>((l) => ({
        ...(l.productId ? { productId: l.productId } : {}),
        ...(l.supplierId ? { supplierId: l.supplierId } : {}),
        description: l.description.trim(),
        qty: num(l.qty),
        ...(num(l.unitCost) > 0 ? { unitCostGhs: num(l.unitCost) } : {}),
        unitPriceGhs: num(l.unitPrice),
      }))
    if (goods.length === 0) {
      setError('Add at least one line with an item, quantity and price.')
      return
    }
    const transport = transportLines
      .filter((t) => t.chargeGhs > 0 || t.transportGhs > 0)
      .map<QuoteLine>((t) => ({
        transport: true,
        supplierId: t.supplierId,
        description: 'Delivery to site (one load)',
        qty: 1,
        ...(t.transportGhs > 0 ? { unitCostGhs: t.transportGhs } : {}),
        unitPriceGhs: t.chargeGhs,
      }))
    const newCustomer: Customer | null = newCustomerMode
      ? {
          id: nextCustomerId(data.customers, mode),
          name: ncName.trim(),
          ...(ncPhone.trim() ? { phone: ncPhone.trim() } : {}),
          city: ncCity.trim() || 'Ghana',
          type: 'contractor',
          productsNeeded: [],
        }
      : null
    const quote: Quote = {
      id: '',
      customerId: newCustomer ? newCustomer.id : customer!.id,
      valueGhs: totals.valueGhs,
      sentOn: localDate(),
      status: 'sent',
      orderIds: [],
      lines: [...goods, ...transport],
      validUntil,
      depositRate,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    onCreate(quote, newCustomer)
  }

  const inputCls =
    'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-400'
  const labelCls = 'block text-[11px] font-medium text-ink-soft'
  const pct = (n: number | null) => (n === null ? 'N/A' : `${Math.round(n * 100)}%`)

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Customer */}
      {data.customers.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className={labelCls}>Customer</span>
            <button
              type="button"
              onClick={() => setNewCustomerMode((v) => !v)}
              className="text-[11px] font-medium text-brand-600 hover:underline"
            >
              {newCustomerMode ? 'Pick an existing customer' : 'New customer'}
            </button>
          </div>
          {!newCustomerMode && (
            <select
              value={customerId}
              aria-label="Customer"
              onChange={(e) => {
                setCustomerId(e.target.value)
                setError('')
              }}
              className={inputCls}
            >
              <option value="">Select customer…</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.city}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {newCustomerMode && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="nq-name">
              Name
            </label>
            <input id="nq-name" value={ncName} onChange={(e) => setNcName(e.target.value)} placeholder="Customer or company name" className={`${inputCls} mt-1.5`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="nq-phone">
              Phone
            </label>
            <input id="nq-phone" value={ncPhone} onChange={(e) => setNcPhone(e.target.value)} placeholder="Optional" className={`${inputCls} mt-1.5`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="nq-city">
              City / area
            </label>
            <input id="nq-city" value={ncCity} onChange={(e) => setNcCity(e.target.value)} placeholder="e.g. Tema" className={`${inputCls} mt-1.5`} />
          </div>
        </div>
      )}

      {/* Markup ladder */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-ink-soft">Markup on cost:</span>
        {MARKUPS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyMarkup(p)}
            className="rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-brand-400 hover:text-brand-600"
            title={`Set every line with a cost to cost +${p}%`}
          >
            +{p}%
          </button>
        ))}
      </div>

      {/* Lines */}
      <div className="space-y-3">
        {lines.map((l, i) => {
          const qty = num(l.qty)
          const product = data.products.find((p) => p.id === l.productId)
          const margin =
            num(l.unitCost) > 0 && num(l.unitPrice) > 0
              ? Math.round(((num(l.unitPrice) - num(l.unitCost)) / num(l.unitPrice)) * 100)
              : null
          return (
            <div key={l.key} className="rounded-lg border border-line bg-subtle p-3">
              <div className="flex items-start gap-2">
                <select
                  value={l.productId}
                  aria-label={`Line ${i + 1} catalogue product`}
                  onChange={(e) => patchLine(l.key, { productId: e.target.value, ...(e.target.value ? {} : { fill: undefined }) }, true)}
                  className={`${inputCls} max-w-[46%] shrink-0`}
                >
                  <option value="">Custom item</option>
                  {data.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {productLabel(p)}
                    </option>
                  ))}
                </select>
                <input
                  value={l.description}
                  onChange={(e) => patchLine(l.key, { description: e.target.value })}
                  placeholder={`Item ${i + 1}: description, brand, spec`}
                  aria-label={`Line ${i + 1} description`}
                  className={inputCls}
                />
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                  className="mt-1 shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-track hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls} htmlFor={`qty-${l.key}`}>
                    Qty{product ? ` (${product.unit}s)` : ''}
                  </label>
                  <input
                    id={`qty-${l.key}`}
                    value={l.qty}
                    inputMode="decimal"
                    onChange={(e) => patchLine(l.key, { qty: e.target.value }, true)}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`cost-${l.key}`}>
                    Our cost per unit
                  </label>
                  <input
                    id={`cost-${l.key}`}
                    value={l.unitCost}
                    inputMode="decimal"
                    placeholder="GH¢"
                    onChange={(e) => patchLine(l.key, { unitCost: e.target.value })}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`price-${l.key}`}>
                    Sell price per unit
                  </label>
                  <input
                    id={`price-${l.key}`}
                    value={l.unitPrice}
                    inputMode="decimal"
                    placeholder="GH¢"
                    onChange={(e) => patchLine(l.key, { unitPrice: e.target.value })}
                    className={`${inputCls} mt-1`}
                  />
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-ink-faint">
                  {l.fill === 'priced' && l.supplierName
                    ? `Best delivered: ${l.supplierName} · ${ghs(num(l.unitCost))} + ${ghs(l.transportGhs ?? 0)} per load (${ghs(l.deliveredPerUnit ?? 0)} per unit delivered)`
                    : l.fill === 'stale'
                      ? null
                      : l.fill === 'none'
                        ? 'No supplier quote for this product yet.'
                        : `Line total ${ghs(num(l.unitPrice) * qty)}`}
                  {l.fill === 'stale' && (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">
                      Stale price: supplier quotes are older than {PRICE_STALE_DAYS} days. Re-check before quoting.
                    </span>
                  )}
                </span>
                {margin !== null && (
                  <span className={`font-medium ${margin < 0 ? 'text-danger' : 'text-success'}`}>{margin}% margin</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => setLines((ls) => [...ls, emptyLine(Math.max(...ls.map((l) => l.key)) + 1)])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-subtle"
      >
        <Plus size={13} />
        Add line
      </button>

      {/* Transport: one load per supplier */}
      {transportLines.length > 0 && (
        <div className="rounded-lg border border-line p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Transport</div>
          <ul className="mt-2 space-y-2">
            {transportLines.map((t) => (
              <li key={t.supplierId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 text-ink">
                  Delivery to site · {t.supplierName}
                  <span className="ml-1.5 text-xs text-ink-faint">1 load, cost {ghs(t.transportGhs)}</span>
                </span>
                <label className="flex items-center gap-2 text-[11px] text-ink-soft">
                  Charge
                  <input
                    value={transportCharge[t.supplierId] ?? String(t.transportGhs)}
                    inputMode="decimal"
                    aria-label={`Transport charge for ${t.supplierName}`}
                    onChange={(e) => setTransportCharge((c) => ({ ...c, [t.supplierId]: e.target.value }))}
                    className={`${inputCls} num w-28 py-1.5`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Totals: margins include transport; deposit and balance per the rules */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border border-line bg-subtle px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Cost incl. transport</div>
          <div className="num mt-0.5 font-semibold text-ink">{totals.costedLines > 0 ? ghs(totals.costGhs) : 'N/A'}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Quote value</div>
          <div className="num mt-0.5 font-bold text-ink">{ghs(totals.valueGhs)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Gross margin</div>
          <div className={`num mt-0.5 font-semibold ${totals.marginGhs < 0 ? 'text-danger' : 'text-ink'}`}>
            {totals.costedLines > 0 ? `${ghs(totals.marginGhs)} · ${pct(totals.grossMarginPct)}` : 'N/A'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            Deposit to confirm ({Math.round(totals.depositRate * 100)}%)
          </div>
          <div className="num mt-0.5 font-semibold text-ink">{ghs(totals.depositGhs)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Balance before offloading</div>
          <div className="num mt-0.5 font-semibold text-ink">{ghs(totals.balanceGhs)}</div>
        </div>
        <div className="col-span-2 self-center text-[11px] text-ink-faint sm:col-span-1">
          {totals.depositRate < DEPOSIT_RATE ? 'Established client: 3+ fully paid orders.' : 'Standard terms.'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="nq-valid">
            Valid until
          </label>
          <input id="nq-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inputCls} mt-1.5`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="nq-notes">
            Notes for the customer
          </label>
          <input
            id="nq-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. prices include delivery within Accra"
            className={`${inputCls} mt-1.5`}
          />
        </div>
      </div>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-subtle"
        >
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover">
          Save quote
        </button>
      </div>
    </form>
  )
}

/* ------------------------------ Print preview ------------------------------ */

/** Customer-facing sheet: white paper, no costs, no margins — those are internal. */
function QuoteSheet({
  quote,
  customer,
  onClose,
  onPrint,
}: {
  quote: Quote
  customer?: Customer
  onClose: () => void
  onPrint: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-950/60 px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-3 flex justify-end gap-2 print:hidden">
          <button
            onClick={onClose}
            className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-subtle"
          >
            Close
          </button>
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
          >
            <Printer size={13} />
            Print / Save as PDF
          </button>
        </div>
        <div className="print-sheet rounded-xl bg-white p-10 text-[#0e1b2c] shadow-xl">
          <div className="flex items-start justify-between border-b border-[#e8e5dd] pb-6">
            <AdensaLogo tone="day" className="h-11" />
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide">QUOTATION</div>
              <div className="mt-1 text-xs text-[#3d4a5c]">{quote.id}</div>
              <div className="text-xs text-[#3d4a5c]">Issued {fmtLong(quote.sentOn)}</div>
              {quote.validUntil && (
                <div className="text-xs text-[#3d4a5c]">Valid until {fmtLong(quote.validUntil)}</div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#566072]">Prepared for</div>
              <div className="mt-1 font-semibold">{customer?.name ?? 'Customer'}</div>
              {customer?.contactPerson && <div className="text-[#3d4a5c]">{customer.contactPerson}</div>}
              <div className="text-[#3d4a5c]">{customer?.city ?? ''}</div>
              {customer?.phone && <div className="text-[#3d4a5c]">{customer.phone}</div>}
            </div>
            <div className="text-right text-[#3d4a5c]">
              <div className="font-semibold text-[#0e1b2c]">Adensa Supply &amp; Logistics Ltd.</div>
              <div>Your project. Our procurement.</div>
            </div>
          </div>

          <table className="mt-8 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[#0e1b2c] text-left text-[10px] uppercase tracking-wide text-[#566072]">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines?.map((l, i) => (
                <tr key={i} className="border-b border-[#e8e5dd]">
                  <td className="py-2.5 pr-3">{l.description}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCount(l.qty)}</td>
                  <td className="py-2.5 text-right tabular-nums">{ghs(l.unitPriceGhs)}</td>
                  <td className="py-2.5 text-right tabular-nums">{ghs(l.unitPriceGhs * l.qty)}</td>
                </tr>
              ))}
              {!quote.lines?.length && (
                <tr className="border-b border-[#e8e5dd]">
                  <td className="py-2.5 pr-3">Supply and delivery as discussed</td>
                  <td className="py-2.5 text-right">1</td>
                  <td className="py-2.5 text-right tabular-nums">{ghs(quote.valueGhs)}</td>
                  <td className="py-2.5 text-right tabular-nums">{ghs(quote.valueGhs)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#0e1b2c]">
                <td colSpan={3} className="py-3 text-right text-xs font-semibold uppercase tracking-wide">
                  Total (GH¢)
                </td>
                <td className="py-3 text-right text-base font-bold tabular-nums">
                  {ghs(
                    quote.lines?.length
                      ? quote.lines.reduce((s, l) => s + l.unitPriceGhs * l.qty, 0)
                      : quote.valueGhs,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Payment terms: deposit confirms, balance before offloading */}
          {(() => {
            const total = quote.lines?.length ? quote.lines.reduce((s, l) => s + l.unitPriceGhs * l.qty, 0) : quote.valueGhs
            const rate = quote.depositRate ?? DEPOSIT_RATE
            const deposit = Math.min(total, requiredDeposit(total, rate))
            return (
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-[#e8e5dd] p-4 text-sm">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#566072]">
                    Deposit to confirm ({Math.round(rate * 100)}%)
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums">{ghs(deposit)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#566072]">Balance before offloading</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{ghs(total - deposit)}</div>
                </div>
                <p className="col-span-2 text-[11px] leading-relaxed text-[#3d4a5c]">{PAYMENT_TERMS}</p>
              </div>
            )
          })()}

          {quote.notes && <p className="mt-5 text-sm text-[#3d4a5c]">{quote.notes}</p>}
          <p className="mt-8 border-t border-[#e8e5dd] pt-4 text-[11px] text-[#566072]">
            Prices are stated in Ghana cedis and are valid until the date shown above. Delivery timelines
            are confirmed at the point of order. Thank you for the opportunity to serve you.
          </p>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Page ----------------------------------- */

const FILTERS: { key: 'all' | QuoteStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Awaiting response' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'expired', label: 'Expired' },
]

export function QuoteBuilderPage({
  data,
  mode,
  onNavigate,
  onViewOrder,
  onCreateQuote,
  onSetStatus,
}: {
  data: QuoteData & { quotes: Quote[]; orders: Order[] }
  mode: DataMode
  onNavigate: (target: NotificationTarget) => void
  /** Open the order detail popup on the Orders page for a reviewed order. */
  onViewOrder: (orderId: string) => void
  onCreateQuote: (q: Quote, newCustomer: Customer | null) => void
  onSetStatus: (quoteId: string, status: QuoteStatus) => void
}) {
  const [filter, setFilter] = useState<'all' | QuoteStatus>('all')
  // ?new=1 (the top bar's New quote button) opens the form, also when the
  // quotes page is already showing; closing the form clears the flag.
  const [searchParams, setSearchParams] = useSearchParams()
  const creating = searchParams.get('new') === '1'
  const setCreating = (open: boolean) =>
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (open) next.set('new', '1')
        else next.delete('new')
        return next
      },
      { replace: !open },
    )
  const [sheetQuoteId, setSheetQuoteId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const list = data.quotes.filter((q) => filter === 'all' || q.status === filter)
    return [...list].sort((a, b) => b.sentOn.localeCompare(a.sentOn))
  }, [data.quotes, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.quotes.length }
    for (const q of data.quotes) c[q.status] = (c[q.status] ?? 0) + 1
    return c
  }, [data.quotes])

  const sheetQuote = sheetQuoteId ? data.quotes.find((q) => q.id === sheetQuoteId) : undefined
  const customerOf = (q: Quote) => data.customers.find((c) => c.id === q.customerId)

  // Draft orders are the approval gate: a manager checks the details (and can
  // edit them from the order popup) before the pipeline starts moving.
  const awaitingApproval = data.orders
    .filter((o) => o.stage === 'draft')
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Quotes</h2>
          <p className="mt-0.5 text-sm text-ink-faint">Catalogue cost, transport and deposit terms on every quote.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition hover:bg-primary-hover"
        >
          <Plus size={15} />
          New quote
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line-strong text-ink-soft hover:bg-subtle'
              }`}
            >
              {f.label}
              {counts[f.key] > 0 && <span className="ml-1.5 opacity-70">{counts[f.key]}</span>}
            </button>
          )
        })}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface p-14 text-center">
          <FileText size={26} className="text-ink-faint" />
          <div className="mt-3 text-sm font-semibold text-ink">
            {data.quotes.length === 0 ? 'No quotes yet' : `No ${QUOTE_STATUS_STYLE[filter as QuoteStatus]?.label.toLowerCase() ?? filter} quotes`}
          </div>
          <p className="mt-1 max-w-sm text-xs text-ink-soft">
            {data.quotes.length === 0
              ? 'Create your first quote: pick the customer, add items with the margin ladder, then print or share it.'
              : 'Try another filter, or create a new quote.'}
          </p>
          {data.quotes.length === 0 && (
            <button
              onClick={() => setCreating(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition hover:bg-primary-hover"
            >
              <Plus size={13} />
              New quote
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Quote</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const t = quoteLineTotals(q)
                const marginPct = t && t.costGhs > 0 ? Math.round((t.marginGhs / t.costGhs) * 100) : null
                const age = daysSince(q.sentOn)
                return (
                  <tr key={q.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="px-4 py-3 font-medium text-ink">{q.id}</td>
                    <td className="px-4 py-3 text-ink-soft">{customerOf(q)?.name ?? 'Customer'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                      {ghs(q.valueGhs)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {marginPct !== null ? (
                        <span className={marginPct < 0 ? 'text-danger' : 'text-brand-600 dark:text-brand-400'}>
                          {marginPct < 0 ? '' : '+'}
                          {marginPct}% · {ghs(t!.marginGhs)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {q.sentOn.slice(8, 10)}/{q.sentOn.slice(5, 7)}
                      {q.status === 'sent' && age >= 3 && (
                        <span className="ml-1.5 text-[11px] font-medium" style={{ color: ALERT_AMBER }}>
                          {age}d
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <QuoteStatusChip status={q.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setSheetQuoteId(q.id)}
                          aria-label={`Print ${q.id}`}
                          title="Print / Save as PDF"
                          className="rounded-lg p-1.5 text-ink-faint transition hover:bg-track hover:text-ink"
                        >
                          <Printer size={15} />
                        </button>
                        {q.status === 'sent' && (
                          <>
                            <button
                              onClick={() => onSetStatus(q.id, 'accepted')}
                              aria-label={`Mark ${q.id} accepted`}
                              title="Mark accepted"
                              className="rounded-lg p-1.5 text-ink-faint transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/50 dark:hover:text-brand-300"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => onSetStatus(q.id, 'declined')}
                              aria-label={`Mark ${q.id} declined`}
                              title="Mark declined"
                              className="rounded-lg p-1.5 text-ink-faint transition hover:bg-track hover:text-danger"
                            >
                              <X size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Orders awaiting approval — accepted quotes become draft orders that
          a manager reviews, edits if needed, then approves into the pipeline. */}
      {awaitingApproval.length > 0 && (
        <section className="rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div>
              <h3 className="text-sm font-semibold text-ink">Orders awaiting approval</h3>
              <p className="mt-0.5 text-xs text-ink-faint">
                {awaitingApproval.length} draft order
                {awaitingApproval.length === 1 ? '' : 's'} · review the details, then approve
              </p>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {awaitingApproval.map((o) => {
              const customer = data.customers.find((c) => c.id === o.customerId)?.name ?? 'Customer'
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {o.id} · {customer}
                    </span>
                    <span className="num block text-[11px] text-ink-faint">
                      {ghs(o.valueGhs)} · {o.lines.length} line{o.lines.length === 1 ? '' : 's'} ·
                      opened {o.receivedOn}
                    </span>
                  </span>
                  <button
                    onClick={() => onViewOrder(o.id)}
                    aria-label={`View ${o.id}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-brand-400 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 dark:hover:border-brand-600 dark:hover:text-brand-400"
                  >
                    <Eye size={14} aria-hidden="true" /> View
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Accepted → next step */}
      {data.quotes.some((q) => q.status === 'accepted' && q.orderIds.length === 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm">
          <span className="text-ink-soft">
            An accepted quote is ready to become an order. The order pipeline page handles that next.
          </span>
          <button
            onClick={() => onNavigate('orders')}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-subtle"
          >
            Open order pipeline
          </button>
        </div>
      )}

      {creating && (
        <KpiDetailModal title="New quote" sub="Catalogue cost, transport and deposit terms" onClose={() => setCreating(false)}>
          <NewQuoteForm
            data={data}
            mode={mode}
            onClose={() => setCreating(false)}
            onCreate={(q, newCustomer) => {
              onCreateQuote(q, newCustomer)
              setCreating(false)
            }}
          />
        </KpiDetailModal>
      )}

      {sheetQuote && (
        <QuoteSheet
          quote={sheetQuote}
          customer={customerOf(sheetQuote)}
          onClose={() => setSheetQuoteId(null)}
          onPrint={() => window.print()}
        />
      )}
    </div>
  )
}
