// Shared metric definitions: the single source of truth for every figure
// that appears on more than one page. Dashboard, Orders and Cash all read
// from computeMetrics(), so the same label can never show two numbers.
//
// Definitions (keep this list in sync with the README):
//
//  Orders
//   - In motion       confirmed and not yet settled: deposit, ordered, delivered.
//   - Awaiting deposit customer said yes (stage "quoted"), no deposit yet.
//   - Late            in motion, not delivered, promised date has passed.
//
//  Quotes
//   - Awaiting response  quotes sent that the customer has not answered.
//     (Not the same as "awaiting deposit": an accepted quote becomes an order.)
//
//  Money
//   - Received        an order's deposit + its balance_in payments (capped at value).
//   - Balance due     per order: value - received.
//   - Still to collect sum of balance due across orders in motion.
//   - Overdue balance  the part of "still to collect" on delivered orders: it
//                     was due before offloading.
//   - Revenue (month) value of orders delivered or settled this month.
//   - Cash on hand     opening float + every ledger entry dated up to today.
//   - Cash in/out      ledger entries in the reporting month.

import type { Dataset } from './dataSource'
import { balanceDue, cashReceived, orderFlags, type RuleContext } from './rules'
import type { CashEntry, Order, OrderStage, Quote } from '../types'

export const IN_MOTION_STAGES: OrderStage[] = ['deposit', 'ordered', 'delivered']

export const isCashIn = (c: Pick<CashEntry, 'kind'>): boolean => c.kind === 'deposit_in' || c.kind === 'balance_in'

const MS_DAY = 86_400_000

export function isoDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ageDays(iso: string, asOf: string): number {
  return Math.round((new Date(`${asOf}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / MS_DAY)
}

export interface Collection {
  order: Order
  received: number
  due: number
  /** Delivered with money still owing: it was due before offloading. */
  overdue: boolean
}

export interface Metrics {
  asOf: string
  month: string
  orders: {
    total: number
    totalValue: number
    inMotion: Order[]
    inMotionValue: number
    awaitingDeposit: Order[]
    awaitingDepositValue: number
    late: Order[]
    flagged: Order[]
  }
  quotes: {
    awaitingResponse: Quote[]
    awaitingResponseValue: number
    oldestAwaitingDays: number
  }
  money: {
    collections: Collection[]
    stillToCollect: number
    overdueBalance: number
    revenueMonth: number
    revenueOrders: Order[]
    cashInMonth: number
    cashOutMonth: number
    cashOnHand: number
  }
}

/** Cash on hand at the end of `iso`: opening float + entries up to that day. */
export function cashOnHandAt(data: Pick<Dataset, 'cash' | 'meta'>, iso: string): number {
  return (
    data.meta.openingCashGhs +
    data.cash.filter((c) => c.date <= iso).reduce((s, c) => s + (isCashIn(c) ? c.ghs : -c.ghs), 0)
  )
}

/** Orders in motion at the end of `iso` (approximate history from dates on the record). */
export function inMotionAt(orders: Order[], iso: string): Order[] {
  return orders.filter((o) => {
    if (!IN_MOTION_STAGES.includes(o.stage) && o.stage !== 'settled') return false
    if (o.receivedOn > iso) return false
    // Settled orders were in motion until they completed.
    return o.stage !== 'settled' || (o.completedOn ?? '') > iso
  })
}

/** Still to collect at the end of `iso`. */
export function stillToCollectAt(orders: Order[], cash: CashEntry[], iso: string): number {
  return inMotionAt(orders, iso).reduce((s, o) => s + Math.max(0, o.valueGhs - cashReceived(o, cash, iso)), 0)
}

export function computeMetrics(data: Dataset, asOf: string = isoDay()): Metrics {
  const month = data.meta.month
  const orders = data.orders
  const ruleCtx: RuleContext = { orders, cash: data.cash, quotes: data.quotes, prices: data.prices }

  const inMotion = orders.filter((o) => IN_MOTION_STAGES.includes(o.stage))
  const awaitingDeposit = orders.filter((o) => o.stage === 'quoted')
  const late = orders.filter(
    (o) => (o.stage === 'deposit' || o.stage === 'ordered') && !!o.expectedDelivery && o.expectedDelivery < asOf,
  )

  const collections: Collection[] = inMotion
    .map((order) => ({
      order,
      received: cashReceived(order, data.cash),
      due: balanceDue(order, data.cash),
      overdue: order.stage === 'delivered',
    }))
    .filter((c) => c.due > 0)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.due - a.due)

  const revenueOrders = orders.filter(
    (o) => (o.stage === 'delivered' || o.stage === 'settled') && (o.completedOn ?? '').startsWith(month),
  )

  const monthCash = data.cash.filter((c) => c.date.startsWith(month))
  const awaitingResponse = data.quotes.filter((q) => q.status === 'sent')

  return {
    asOf,
    month,
    orders: {
      total: orders.length,
      totalValue: orders.reduce((s, o) => s + o.valueGhs, 0),
      inMotion,
      inMotionValue: inMotion.reduce((s, o) => s + o.valueGhs, 0),
      awaitingDeposit,
      awaitingDepositValue: awaitingDeposit.reduce((s, o) => s + o.valueGhs, 0),
      late,
      flagged: orders.filter((o) => orderFlags(o, ruleCtx, asOf).length > 0),
    },
    quotes: {
      awaitingResponse,
      awaitingResponseValue: awaitingResponse.reduce((s, q) => s + q.valueGhs, 0),
      oldestAwaitingDays: awaitingResponse.reduce((m, q) => Math.max(m, ageDays(q.sentOn, asOf)), 0),
    },
    money: {
      collections,
      stillToCollect: collections.reduce((s, c) => s + c.due, 0),
      overdueBalance: collections.filter((c) => c.overdue).reduce((s, c) => s + c.due, 0),
      revenueMonth: revenueOrders.reduce((s, o) => s + o.valueGhs, 0),
      revenueOrders,
      cashInMonth: monthCash.filter(isCashIn).reduce((s, c) => s + c.ghs, 0),
      cashOutMonth: monthCash.filter((c) => !isCashIn(c)).reduce((s, c) => s + c.ghs, 0),
      cashOnHand: cashOnHandAt(data, asOf),
    },
  }
}
