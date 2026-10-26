import { describe, expect, it } from 'vitest'
import { demo } from '../data/demo'
import { autoFillCost, quoteTotals, transportLoads } from './quote'

describe('autoFillCost', () => {
  it('fills the best delivered supplier cost from the catalogue (same pick as Compare)', () => {
    const r = autoFillCost('d-prd-001', 100, demo.prices, demo.suppliers)
    expect(r.kind).toBe('priced')
    if (r.kind !== 'priced') return
    // Coastal Cement Depot: 104 + 90 transport -> 104.90 delivered per bag at 100 bags.
    expect(r.pick.supplierName).toBe('Coastal Cement Depot')
    expect(r.pick.unitCostGhs).toBe(104)
    expect(r.pick.transportGhs).toBe(90)
    expect(r.pick.deliveredPerUnitGhs).toBe(104.9)
  })

  it('refuses to auto-fill from stale prices', () => {
    // Distribution board prices are older than 14 days in the demo seed.
    expect(autoFillCost('d-prd-006', 4, demo.prices, demo.suppliers).kind).toBe('stale')
  })

  it('reports products with no supplier quotes', () => {
    expect(autoFillCost('d-prd-010', 1, demo.prices, demo.suppliers).kind).toBe('none')
  })
})

describe('quoteTotals', () => {
  it('includes transport cost so the margin is real, and splits 70% deposit / balance', () => {
    const t = quoteTotals([
      { qty: 100, unitCostGhs: 104, unitPriceGhs: 120 },
      { qty: 1, unitCostGhs: 90, unitPriceGhs: 90 },
    ])
    expect(t.costGhs).toBe(10_490)
    expect(t.valueGhs).toBe(12_090)
    expect(t.marginGhs).toBe(1_600)
    expect(t.grossMarginPct).toBeCloseTo(1_600 / 12_090)
    expect(t.depositGhs).toBe(8_470)
    expect(t.balanceGhs).toBe(3_620)
  })

  it('uses the 50% rate for established clients', () => {
    const t = quoteTotals([{ qty: 1, unitPriceGhs: 1_000 }], 0.5)
    expect(t.depositGhs).toBe(500)
    expect(t.marginPct).toBeNull()
  })
})

describe('transportLoads', () => {
  it('charges one load per supplier used', () => {
    const loads = transportLoads([
      { supplierId: 'a', supplierName: 'A', transportGhs: 90 },
      { supplierId: 'a', supplierName: 'A', transportGhs: 90 },
      { supplierId: 'b', supplierName: 'B', transportGhs: 0 },
      { transportGhs: 50 },
    ])
    expect(loads).toEqual([
      { supplierId: 'a', supplierName: 'A', transportGhs: 90 },
      { supplierId: 'b', supplierName: 'B', transportGhs: 0 },
    ])
  })
})
