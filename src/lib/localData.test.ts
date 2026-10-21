// Unit tests for the local record store: id allocation across seed+local,
// merge precedence, mode-scoped keys, and corrupt-payload resilience.

import { describe, expect, it } from 'vitest'
import { demo } from '../data/demo'
import {
  loadLocal,
  mergeDataset,
  nextCashId,
  nextCustomerId,
  nextOrderId,
  nextQuoteId,
  type LocalRecords,
} from './localData'
import type { Customer, Order, Quote } from '../types'

const EMPTY: LocalRecords = {
  customers: [],
  orders: [],
  inquiries: [],
  quotes: [],
  cash: [],
  quoteOverrides: {},
  orderOverrides: {},
}

describe('id allocation', () => {
  it('nextQuoteId continues from the highest seeded QT-nnn', () => {
    const quotes: Quote[] = [
      { id: 'QT-017', customerId: 'c1', valueGhs: 1, sentOn: '2026-10-01', status: 'sent', orderIds: [] },
      { id: 'QT-004', customerId: 'c2', valueGhs: 1, sentOn: '2026-10-01', status: 'sent', orderIds: [] },
    ]
    expect(nextQuoteId(quotes)).toBe('QT-018')
    expect(nextQuoteId([])).toBe('QT-001')
  })

  it('nextOrderId continues from the highest seeded ORD-nnnn', () => {
    const orders: Order[] = [
      {
        id: 'ORD-0241',
        customerId: 'c1',
        lines: [],
        stage: 'quoted',
        valueGhs: 1,
        depositGhs: 0,
        receivedOn: '2026-10-01',
      },
    ]
    expect(nextOrderId(orders)).toBe('ORD-0242')
  })

  it('nextCustomerId follows the mode prefix (d-cus- in demo, cus- in real)', () => {
    const customers: Customer[] = [
      { id: 'd-cus-012', name: 'A', city: 'Tema', type: 'contractor', productsNeeded: ['cement'] },
      { id: 'cus-003', name: 'B', city: 'Accra', type: 'plumber', productsNeeded: ['plumbing'] },
    ]
    expect(nextCustomerId(customers, 'demo')).toBe('d-cus-013')
    expect(nextCustomerId(customers, 'real')).toBe('cus-004')
  })

  it('nextCashId follows the mode prefix', () => {
    const cash = [{ id: 'd-csh-007', date: '2026-10-01', kind: 'expense_out' as const, ghs: 10, label: 'x' }]
    expect(nextCashId(cash, 'demo')).toBe('d-csh-008')
    expect(nextCashId(cash, 'real')).toBe('csh-001')
  })
})

describe('mergeDataset', () => {
  it('applies local overrides over seeded records', () => {
    const seeded = demo.orders[0]
    const merged = mergeDataset(demo, {
      ...EMPTY,
      orderOverrides: { [seeded.id]: { stage: 'settled' } },
    })
    expect(merged.orders.find((o) => o.id === seeded.id)?.stage).toBe('settled')
  })

  it('applies detail-edit overrides (lines, value, dates, notes) over a seeded order', () => {
    const seeded = demo.orders[0]
    const merged = mergeDataset(demo, {
      ...EMPTY,
      orderOverrides: {
        [seeded.id]: {
          lines: [{ description: 'Corrected item', qty: 2, unitGhs: 100 }],
          valueGhs: 200,
          receivedOn: '2026-10-05',
          expectedDelivery: '2026-10-20',
          notes: 'Manager correction before approval.',
        },
      },
    })
    const order = merged.orders.find((o) => o.id === seeded.id)!
    expect(order.lines).toEqual([{ description: 'Corrected item', qty: 2, unitGhs: 100 }])
    expect(order.valueGhs).toBe(200)
    expect(order.receivedOn).toBe('2026-10-05')
    expect(order.expectedDelivery).toBe('2026-10-20')
    expect(order.notes).toBe('Manager correction before approval.')
    // Cash already recorded on the order is untouched by a detail edit.
    expect(order.depositGhs).toBe(seeded.depositGhs)
  })

  it('keeps seed and local records side by side', () => {
    const merged = mergeDataset(demo, {
      ...EMPTY,
      quotes: [
        { id: 'QT-900', customerId: 'c1', valueGhs: 5, sentOn: '2026-10-02', status: 'sent', orderIds: [] },
      ],
    })
    expect(merged.quotes.length).toBe(demo.quotes.length + 1)
    expect(merged.customers.length).toBe(demo.customers.length)
  })

  it('does not mutate the base dataset', () => {
    const before = JSON.stringify(demo)
    mergeDataset(demo, { ...EMPTY, orderOverrides: { [demo.orders[0].id]: { stage: 'settled' } } })
    expect(JSON.stringify(demo)).toBe(before)
  })
})

describe('loadLocal', () => {
  it('returns empty records when nothing is stored', () => {
    expect(loadLocal('demo')).toEqual(EMPTY)
  })

  it('stores per mode so demo records never surface in real mode', () => {
    localStorage.setItem(
      'adensa.localRecords.demo.v1',
      JSON.stringify({
        ...EMPTY,
        quotes: [{ id: 'QT-901', customerId: 'c1', valueGhs: 9, sentOn: '2026-10-02', status: 'sent', orderIds: [] }],
      }),
    )
    expect(loadLocal('demo').quotes).toHaveLength(1)
    expect(loadLocal('real').quotes).toHaveLength(0)
  })

  it('never trusts a corrupt payload — falls back to empty instead of crashing', () => {
    localStorage.setItem('adensa.localRecords.demo.v1', '{not json')
    expect(loadLocal('demo')).toEqual(EMPTY)
    localStorage.setItem('adensa.localRecords.demo.v1', '{"quotes": "nope"}')
    expect(loadLocal('demo')).toEqual(EMPTY)
  })
})
