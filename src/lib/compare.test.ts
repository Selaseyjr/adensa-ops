import { describe, expect, it } from 'vitest'
import type { Price, Supplier } from '../types'
import { bestDelivered, deliveredCosts, marketReference, productLabel, savingsVsMarket } from './compare'

const asOf = new Date('2026-10-20T00:00:00')
const sup = (id: string): Supplier => ({ id, name: `Supplier ${id}`, category: 'cement', location: '', city: '', status: 'vetted', delivery: 'own_fleet' })
const q = (supplierId: string, ghs: number, transportGhs: number, extra: Partial<Price> = {}): Price => ({
  productId: 'p1',
  supplierId,
  ghs,
  transportGhs,
  type: 'quoted',
  capturedOn: '2026-10-18',
  inStock: true,
  ...extra,
})

describe('delivered cost', () => {
  const prices = [q('a', 100, 600), q('b', 104, 90), { productId: 'p1', ghs: 110, type: 'market_reference', capturedOn: '2026-10-15' } as Price]
  const suppliers = [sup('a'), sup('b')]

  it('spreads per-load transport across the quantity', () => {
    const rows = deliveredCosts(prices, suppliers, 'p1', 100, asOf)
    const a = rows.find((r) => r.price.supplierId === 'a')!
    expect(a.transportPerUnitGhs).toBe(6)
    expect(a.perUnitGhs).toBe(106)
    expect(a.totalGhs).toBe(10_600)
  })

  it('the cheapest supplier depends on quantity once transport is per load', () => {
    // 100 units: a = 106.00, b = 104.90 -> b wins.
    expect(bestDelivered(deliveredCosts(prices, suppliers, 'p1', 100, asOf))!.price.supplierId).toBe('b')
    // 1,000 units: a = 100.60, b = 104.09 -> a wins.
    expect(bestDelivered(deliveredCosts(prices, suppliers, 'p1', 1000, asOf))!.price.supplierId).toBe('a')
  })

  it('never picks a stale or out-of-stock quote as best', () => {
    const rows = deliveredCosts(
      [q('a', 90, 0, { capturedOn: '2026-09-01' }), q('b', 95, 0, { inStock: false }), q('c', 99, 0)],
      [sup('a'), sup('b'), sup('c')],
      'p1',
      10,
      asOf,
    )
    expect(rows[0].stale).toBe(true)
    expect(bestDelivered(rows)!.price.supplierId).toBe('c')
  })

  it('measures savings against the market reference, not the dearest supplier', () => {
    const rows = deliveredCosts(prices, suppliers, 'p1', 100, asOf)
    const s = savingsVsMarket(bestDelivered(rows), marketReference(prices, 'p1'), 100)!
    expect(s.perUnitGhs).toBeCloseTo(5.1)
    expect(s.totalGhs).toBeCloseTo(510)
    expect(s.pct).toBeCloseTo(5.1 / 110)
    expect(savingsVsMarket(bestDelivered(rows), undefined, 100)).toBeNull()
  })
})

describe('productLabel', () => {
  it('does not repeat spec parts already in the name', () => {
    expect(productLabel({ brand: 'GHACEM', name: 'Cement, 50 kg bag', spec: '42.5R grade, 50 kg bag' })).toBe(
      'GHACEM Cement, 50 kg bag · 42.5R grade',
    )
    expect(productLabel({ brand: 'Bosch', name: 'Angle grinder', spec: '115 mm disc, 900 W' })).toBe(
      'Bosch Angle grinder · 115 mm disc, 900 W',
    )
  })
})
