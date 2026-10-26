import { describe, expect, it } from 'vitest'
import type { CashEntry, Order, Price, Quote } from '../types'
import {
  cashReceived,
  orderFlags,
  quoteFlags,
  requiredDeposit,
  requiredDepositRate,
  type RuleContext,
} from './rules'

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
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({ orders: [], cash: [], quotes: [], prices: [], ...over })
const keys = (o: Order, c: RuleContext, asOf = '2026-10-20') => orderFlags(o, c, asOf).map((f) => f.key)

describe('deposit rule', () => {
  it('requires 70%, rounded up to the next GH¢10', () => {
    expect(requiredDeposit(10_000)).toBe(7_000)
    expect(requiredDeposit(2_490)).toBe(1_750)
  })

  it('drops to 50% for a client with 3+ fully paid orders', () => {
    const paid = [1, 2, 3].map((n) => order({ id: `P${n}`, stage: 'settled', depositGhs: 10_000 }))
    expect(requiredDepositRate('c1', paid.slice(0, 2), [])).toBe(0.7)
    expect(requiredDepositRate('c1', paid, [])).toBe(0.5)
    // The order being judged never counts towards its own history.
    expect(requiredDepositRate('c1', paid, [], 'P3')).toBe(0.7)
  })

  it('flags a confirmed order below the required deposit', () => {
    const o = order({ depositGhs: 5_000 })
    const flags = orderFlags(o, ctx({ orders: [o] }), '2026-10-02')
    expect(flags.map((f) => f.key)).toEqual(['deposit_below_rule'])
    expect(flags[0].label).toBe('Deposit below 70%')
  })

  it('does not flag quotes or drafts for deposits', () => {
    expect(keys(order({ stage: 'quoted', depositGhs: 0, receivedOn: '2026-10-19' }), ctx())).toEqual([])
  })
})

describe('balance before offloading', () => {
  it('flags a delivered order that still owes money', () => {
    const o = order({ stage: 'delivered' })
    expect(keys(o, ctx({ orders: [o] }))).toContain('balance_owing_delivered')
  })

  it('counts balance payments recorded in cash', () => {
    const o = order({ stage: 'delivered' })
    const cash: CashEntry[] = [{ id: 'x', date: '2026-10-05', kind: 'balance_in', ghs: 3_000, label: '', orderId: 'ORD-1' }]
    expect(cashReceived(o, cash)).toBe(10_000)
    expect(keys(o, ctx({ orders: [o], cash }))).toEqual([])
  })
})

describe('late, expiring and stale', () => {
  it('flags an undelivered order past its promised date', () => {
    const o = order({ expectedDelivery: '2026-10-18' })
    expect(keys(o, ctx({ orders: [o] }))).toEqual(['late'])
    expect(keys(o, ctx({ orders: [o] }), '2026-10-18')).toEqual([])
  })

  it('flags quotes within 3 days of expiry', () => {
    const q: Quote = { id: 'QT-1', customerId: 'c1', valueGhs: 1, sentOn: '2026-10-01', status: 'sent', orderIds: [] }
    expect(quoteFlags(q, '2026-10-10')).toEqual([])
    expect(quoteFlags(q, '2026-10-12')[0].key).toBe('quote_expiring')
    expect(quoteFlags({ ...q, validUntil: '2026-10-30' }, '2026-10-12')).toEqual([])
    expect(quoteFlags({ ...q, status: 'accepted' }, '2026-10-20')).toEqual([])
  })

  it('flags unconfirmed orders priced only from stale supplier prices', () => {
    const prices: Price[] = [{ productId: 'p1', supplierId: 's1', ghs: 10, type: 'quoted', capturedOn: '2026-10-01' }]
    const o = order({ stage: 'draft', depositGhs: 0, lines: [{ productId: 'p1', description: 'Cable', qty: 1, unitGhs: 10 }] })
    expect(keys(o, ctx({ prices }), '2026-10-20')).toEqual(['stale_price'])
    expect(keys(o, ctx({ prices }), '2026-10-10')).toEqual([])
    // Confirmed orders are already priced: no stale flag.
    expect(keys({ ...o, stage: 'ordered', depositGhs: 7_000 }, ctx({ prices }), '2026-10-20')).toEqual([])
  })
})
