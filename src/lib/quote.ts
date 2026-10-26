// Quote builder maths, kept pure so it can be tested and shared.
//
// - Catalogue lines auto-fill their cost from the same best-delivered pick
//   as Compare prices (fresh, in-stock quotes only).
// - Transport is its own line: one load per supplier used, at the cost that
//   supplier quoted. Its sell price defaults to cost and can be changed.
// - The deposit that confirms the order is 70% (50% for established
//   clients); the balance is due before offloading.

import { bestDelivered, deliveredCosts, type DeliveredCost } from './compare'
import { DEPOSIT_RATE, requiredDeposit } from './rules'
import type { Price, Supplier } from '../types'

export interface CostPick {
  supplierId: string
  supplierName: string
  /** Supplier unit price (goods only; transport goes on its own line). */
  unitCostGhs: number
  /** Supplier's per-load transport charge. */
  transportGhs: number
  /** Unit + transport spread over the quantity, for reference. */
  deliveredPerUnitGhs: number
}

export type AutoFill =
  | { kind: 'priced'; pick: CostPick }
  /** Quotes exist but none is fresh and in stock: re-check before quoting. */
  | { kind: 'stale' }
  | { kind: 'none' }

export function autoFillCost(
  productId: string,
  quantity: number,
  prices: Price[],
  suppliers: Supplier[],
  asOf?: Date,
): AutoFill {
  const rows = deliveredCosts(prices, suppliers, productId, quantity, asOf)
  if (rows.length === 0) return { kind: 'none' }
  const best: DeliveredCost | undefined = bestDelivered(rows)
  if (!best) return { kind: 'stale' }
  return {
    kind: 'priced',
    pick: {
      supplierId: best.price.supplierId ?? '',
      supplierName: best.supplier?.name ?? 'Supplier',
      unitCostGhs: best.unitGhs,
      transportGhs: best.transportGhs,
      deliveredPerUnitGhs: best.perUnitGhs,
    },
  }
}

export interface PricedLine {
  qty: number
  unitCostGhs?: number
  unitPriceGhs: number
}

export interface QuoteTotals {
  costGhs: number
  valueGhs: number
  marginGhs: number
  /** Margin on cost; null when no line has a cost. */
  marginPct: number | null
  /** Margin on sale value; null when value is 0. */
  grossMarginPct: number | null
  depositRate: number
  depositGhs: number
  balanceGhs: number
  costedLines: number
}

export function quoteTotals(lines: PricedLine[], depositRate: number = DEPOSIT_RATE): QuoteTotals {
  let cost = 0
  let value = 0
  let costedLines = 0
  for (const l of lines) {
    value += l.unitPriceGhs * l.qty
    if (l.unitCostGhs !== undefined && l.unitCostGhs > 0) {
      cost += l.unitCostGhs * l.qty
      costedLines += 1
    }
  }
  const margin = value - cost
  const deposit = Math.min(value, requiredDeposit(value, depositRate))
  return {
    costGhs: cost,
    valueGhs: value,
    marginGhs: margin,
    marginPct: cost > 0 ? margin / cost : null,
    grossMarginPct: value > 0 ? margin / value : null,
    depositRate,
    depositGhs: deposit,
    balanceGhs: value - deposit,
    costedLines,
  }
}

/** One load per supplier used: the transport each chosen supplier quoted. */
export function transportLoads(picks: { supplierId?: string; transportGhs?: number; supplierName?: string }[]): {
  supplierId: string
  supplierName: string
  transportGhs: number
}[] {
  const bySupplier = new Map<string, { supplierId: string; supplierName: string; transportGhs: number }>()
  for (const p of picks) {
    if (!p.supplierId || p.transportGhs === undefined) continue
    const prev = bySupplier.get(p.supplierId)
    // A shared load carries every line from that supplier; keep its largest quote.
    if (!prev || p.transportGhs > prev.transportGhs) {
      bySupplier.set(p.supplierId, { supplierId: p.supplierId, supplierName: p.supplierName ?? 'Supplier', transportGhs: p.transportGhs })
    }
  }
  return [...bySupplier.values()]
}
