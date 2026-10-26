// Adensa business rules, as code. One place answers "is this order/quote in
// line with how we trade?", so the Orders table, the Dashboard's Needs
// attention panel and the simulation all apply the same checks.
//
//  - A 70% deposit confirms an order; the balance is due before offloading.
//  - Established clients (3+ fully paid orders) may confirm with 50%.
//  - Supplier prices older than 14 days are stale and must be re-checked
//    before quoting.
//  - Quotes are valid for 14 days unless they carry their own validUntil.

import {
  isPriceStale,
  type CashEntry,
  type Customer,
  type Order,
  type Price,
  type Quote,
} from '../types'
import { formatGhs } from './format'

/** Printed on quotes and unpaid invoices: the company's payment rules. */
export const PAYMENT_TERMS =
  "The deposit confirms the order. The balance is due before offloading on delivery. Pay only into Adensa Supply & Logistics Ltd's MoMo merchant or bank account."

export const DEPOSIT_RATE = 0.7
export const ESTABLISHED_DEPOSIT_RATE = 0.5
export const ESTABLISHED_MIN_PAID_ORDERS = 3
export const QUOTE_VALIDITY_DAYS = 14
/** A quote within this many days of expiry (or past it) is flagged. */
export const QUOTE_EXPIRING_DAYS = 3

/** Stages where the customer has committed money (deposit onwards). */
const CONFIRMED_STAGES: Order['stage'][] = ['deposit', 'ordered', 'delivered', 'settled']
/** Stages where goods are still on their way to the customer. */
const AWAITING_DELIVERY: Order['stage'][] = ['deposit', 'ordered']
/** Stages where pricing can still change (nothing confirmed yet). */
const UNCONFIRMED_STAGES: Order['stage'][] = ['draft', 'quoted']

export interface RuleContext {
  orders: Order[]
  cash: CashEntry[]
  quotes: Quote[]
  prices: Price[]
  customers?: Customer[]
}

const MS_DAY = 86_400_000

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days from `from` to `to` (both ISO dates); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / MS_DAY)
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Cash received against an order: the recorded deposit plus balance
 * payments, capped at the order value. `asOf` limits balance entries to
 * those dated on or before that day.
 */
export function cashReceived(order: Order, cash: CashEntry[], asOf?: string): number {
  const balances = cash
    .filter((c) => c.orderId === order.id && c.kind === 'balance_in' && (!asOf || c.date <= asOf))
    .reduce((s, c) => s + c.ghs, 0)
  return Math.min(order.valueGhs, order.depositGhs + balances)
}

export function balanceDue(order: Order, cash: CashEntry[]): number {
  return Math.max(0, order.valueGhs - cashReceived(order, cash))
}

/** Orders this customer has paid in full, not counting `excludeId`. */
export function fullyPaidOrderCount(customerId: string, orders: Order[], cash: CashEntry[], excludeId?: string): number {
  return orders.filter(
    (o) => o.customerId === customerId && o.id !== excludeId && o.valueGhs > 0 && balanceDue(o, cash) === 0 && CONFIRMED_STAGES.includes(o.stage),
  ).length
}

/** 70% by default; 50% for an established client (3+ fully paid orders). */
export function requiredDepositRate(customerId: string, orders: Order[], cash: CashEntry[], excludeId?: string): number {
  return fullyPaidOrderCount(customerId, orders, cash, excludeId) >= ESTABLISHED_MIN_PAID_ORDERS
    ? ESTABLISHED_DEPOSIT_RATE
    : DEPOSIT_RATE
}

/** Deposit needed to confirm, rounded up to the next GH¢10. */
export function requiredDeposit(valueGhs: number, rate: number = DEPOSIT_RATE): number {
  return Math.ceil((valueGhs * rate) / 10) * 10
}

/** When a sent quote stops being valid. */
export function quoteExpiry(q: Pick<Quote, 'sentOn' | 'validUntil'>): string {
  return q.validUntil ?? addDays(q.sentOn, QUOTE_VALIDITY_DAYS)
}

/** True when no supplier price for this product is fresh (all quoted prices stale, or none). */
export function hasOnlyStalePrices(productId: string, prices: Price[], asOf?: Date): boolean {
  const quoted = prices.filter((p) => p.productId === productId && p.type === 'quoted')
  if (quoted.length === 0) return false
  return quoted.every((p) => isPriceStale(p, asOf))
}

export type RuleFlagKey = 'balance_owing_delivered' | 'deposit_below_rule' | 'late' | 'quote_expiring' | 'stale_price'

export interface RuleFlag {
  key: RuleFlagKey
  label: string
  detail: string
  /** A few characters for tight spaces (e.g. "3d late", "GH¢13,080"). */
  short: string
  /** danger = money or commitment at risk; warning = act soon. */
  tone: 'danger' | 'warning'
}

function expiryDetail(left: number): string {
  if (left < 0) return `Expired ${-left} day${left === -1 ? '' : 's'} ago.`
  if (left === 0) return 'Expires today.'
  return `Expires in ${left} day${left === 1 ? '' : 's'}.`
}
const expiryShort = (left: number) => (left < 0 ? 'Expired' : left === 0 ? 'Today' : `${left}d left`)

const pct = (n: number) => `${Math.round(n * 100)}%`
const money = formatGhs

/** Every rule an order currently breaks, most serious first. */
export function orderFlags(order: Order, ctx: RuleContext, asOf: string = isoToday()): RuleFlag[] {
  const flags: RuleFlag[] = []
  const due = balanceDue(order, ctx.cash)

  if ((order.stage === 'delivered' || order.stage === 'settled') && due > 0) {
    flags.push({
      key: 'balance_owing_delivered',
      label: 'Delivered with balance owing',
      detail: `${money(due)} was due before offloading.`,
      short: money(due),
      tone: 'danger',
    })
  }

  if (CONFIRMED_STAGES.includes(order.stage) && order.valueGhs > 0) {
    const rate = requiredDepositRate(order.customerId, ctx.orders, ctx.cash, order.id)
    const needed = requiredDeposit(order.valueGhs, rate)
    if (order.depositGhs < needed) {
      flags.push({
        key: 'deposit_below_rule',
        label: `Deposit below ${pct(rate)}`,
        detail: `${money(order.depositGhs)} received, ${money(needed)} (${pct(rate)}) required to confirm.`,
        short: pct(order.depositGhs / order.valueGhs),
        tone: 'danger',
      })
    }
  }

  if (AWAITING_DELIVERY.includes(order.stage) && order.expectedDelivery && order.expectedDelivery < asOf) {
    const late = daysBetween(order.expectedDelivery, asOf)
    flags.push({
      key: 'late',
      label: 'Late',
      detail: `Promised for ${order.expectedDelivery}, ${late} day${late === 1 ? '' : 's'} overdue.`,
      short: `${late}d late`,
      tone: 'warning',
    })
  }

  if (order.stage === 'quoted') {
    const quote = ctx.quotes.find((q) => q.orderIds.includes(order.id))
    const expiry = quote ? quoteExpiry(quote) : addDays(order.receivedOn, QUOTE_VALIDITY_DAYS)
    const left = daysBetween(asOf, expiry)
    if (left <= QUOTE_EXPIRING_DAYS) {
      flags.push({
        key: 'quote_expiring',
        label: 'Quote expiring',
        detail: expiryDetail(left),
        short: expiryShort(left),
        tone: 'warning',
      })
    }
  }

  if (UNCONFIRMED_STAGES.includes(order.stage)) {
    const asOfDate = new Date(`${asOf}T00:00:00`)
    const stale = order.lines.filter((l) => l.productId && hasOnlyStalePrices(l.productId, ctx.prices, asOfDate))
    if (stale.length > 0) {
      flags.push({
        key: 'stale_price',
        label: 'Stale price',
        detail: `${stale.map((l) => l.description).join(', ')}: re-check the supplier price before confirming.`,
        short: 'Re-check',
        tone: 'warning',
      })
    }
  }

  return flags
}

/** Rule checks on a sent quote (expiry). */
export function quoteFlags(quote: Quote, asOf: string = isoToday()): RuleFlag[] {
  if (quote.status !== 'sent') return []
  const left = daysBetween(asOf, quoteExpiry(quote))
  if (left > QUOTE_EXPIRING_DAYS) return []
  return [
    {
      key: 'quote_expiring',
      label: 'Quote expiring',
      detail: expiryDetail(left),
      short: expiryShort(left),
      tone: 'warning',
    },
  ]
}
