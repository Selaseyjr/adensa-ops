import { describe, expect, it } from 'vitest'
import { demo } from './demo'
import { localDate } from '../lib/localData'
import { orderFlags, requiredDeposit } from '../lib/rules'

const ctx = { orders: demo.orders, cash: demo.cash, quotes: demo.quotes, prices: demo.prices }

describe('demo dataset', () => {
  it('is dated relative to today, so it never goes stale', () => {
    const latest = demo.orders.map((o) => o.receivedOn).sort().at(-1)
    expect(latest).toBe(localDate())
    expect(demo.meta.month).toBe(localDate().slice(0, 7))
  })

  it('follows the 70% deposit rule, apart from the deliberate example', () => {
    const confirmed = demo.orders.filter((o) => ['deposit', 'ordered', 'delivered', 'settled'].includes(o.stage))
    const below = confirmed.filter((o) => o.depositGhs < requiredDeposit(o.valueGhs)).map((o) => o.id)
    expect(below).toEqual(['ORD-0237'])
  })

  it('records every deposit in the cash ledger', () => {
    for (const o of demo.orders.filter((o) => o.depositGhs > 0)) {
      const deposits = demo.cash.filter((c) => c.orderId === o.id && c.kind === 'deposit_in')
      expect(deposits.reduce((s, c) => s + c.ghs, 0), o.id).toBe(o.depositGhs)
    }
  })

  it('shows one example of every rule-break flag', () => {
    const seen = new Set(demo.orders.flatMap((o) => orderFlags(o, ctx).map((f) => f.key)))
    expect([...seen].sort()).toEqual(['balance_owing_delivered', 'deposit_below_rule', 'late', 'quote_expiring', 'stale_price'])
  })
})
