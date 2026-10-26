import { describe, expect, it } from 'vitest'
import type { Dataset } from './dataSource'
import { cashOnHandAt, computeMetrics, stillToCollectAt } from './metrics'
import type { Order } from '../types'

const order = (o: Partial<Order>): Order => ({
  id: 'ORD-1',
  customerId: 'c1',
  lines: [],
  stage: 'ordered',
  valueGhs: 10_000,
  depositGhs: 7_000,
  receivedOn: '2026-10-01',
  ...o,
})

const base: Dataset = {
  suppliers: [],
  products: [],
  prices: [],
  customers: [],
  inquiries: [],
  orders: [],
  quotes: [],
  cash: [],
  meta: { month: '2026-10', revenueTargetGhs: 0, openingCashGhs: 1_000 },
}

describe('computeMetrics', () => {
  const data: Dataset = {
    ...base,
    orders: [
      order({ id: 'A', stage: 'ordered', expectedDelivery: '2026-10-05' }),
      order({ id: 'B', stage: 'delivered', completedOn: '2026-10-08' }),
      order({ id: 'C', stage: 'settled', completedOn: '2026-10-09' }),
      order({ id: 'D', stage: 'quoted', depositGhs: 0 }),
      order({ id: 'E', stage: 'draft', depositGhs: 0 }),
    ],
    quotes: [
      { id: 'QT-1', customerId: 'c1', valueGhs: 500, sentOn: '2026-10-02', status: 'sent', orderIds: [] },
      { id: 'QT-2', customerId: 'c1', valueGhs: 900, sentOn: '2026-10-03', status: 'accepted', orderIds: ['D'] },
    ],
    cash: [
      { id: '1', date: '2026-09-30', kind: 'deposit_in', ghs: 7_000, label: '', orderId: 'A' },
      { id: '2', date: '2026-10-09', kind: 'balance_in', ghs: 3_000, label: '', orderId: 'C' },
      { id: '3', date: '2026-10-10', kind: 'supplier_out', ghs: 2_000, label: '' },
      { id: '4', date: '2026-10-30', kind: 'expense_out', ghs: 100, label: '' },
    ],
  }
  const m = computeMetrics(data, '2026-10-12')

  it('separates orders in motion from awaiting deposit and drafts', () => {
    expect(m.orders.inMotion.map((o) => o.id)).toEqual(['A', 'B'])
    expect(m.orders.awaitingDeposit.map((o) => o.id)).toEqual(['D'])
    expect(m.orders.late.map((o) => o.id)).toEqual(['A'])
  })

  it('separates quotes awaiting a response from orders awaiting a deposit', () => {
    expect(m.quotes.awaitingResponse.map((q) => q.id)).toEqual(['QT-1'])
    expect(m.quotes.oldestAwaitingDays).toBe(10)
  })

  it('still to collect = balance due on orders in motion; delivered debt is overdue', () => {
    expect(m.money.stillToCollect).toBe(6_000)
    expect(m.money.overdueBalance).toBe(3_000)
    expect(m.money.collections[0].order.id).toBe('B')
  })

  it('revenue counts orders delivered or settled this month', () => {
    expect(m.money.revenueMonth).toBe(20_000)
  })

  it('cash on hand = opening float + every movement up to today; month flows are separate', () => {
    expect(m.money.cashOnHand).toBe(1_000 + 7_000 + 3_000 - 2_000)
    expect(m.money.cashInMonth).toBe(3_000)
    expect(m.money.cashOutMonth).toBe(2_100)
    expect(cashOnHandAt(data, '2026-09-30')).toBe(8_000)
  })

  it('evaluates still-to-collect as of a past date', () => {
    // On 5 Oct: A (3,000 due), B (3,000 due) and C (not settled yet, 3,000 due).
    expect(stillToCollectAt(data.orders, data.cash, '2026-10-05')).toBe(9_000)
  })
})
