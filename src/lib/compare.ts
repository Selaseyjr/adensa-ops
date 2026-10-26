// Supplier price comparison maths, shared by Compare prices and the quote
// builder so both always agree on the "best delivered" cost.
//
// - Transport is quoted per load, so it is spread across the quantity being
//   bought: per-unit delivered = unit price + transport / quantity.
// - Only fresh (<= 14 days), in-stock quotes can be "best": a stale price
//   must be re-checked before it is used in a quote.
// - Savings are measured against the market reference, not against the
//   most expensive supplier (that number flatters every comparison).

import { isPriceStale, type Price, type Product, type Supplier } from '../types'

export interface DeliveredCost {
  price: Price
  supplier?: Supplier
  /** Supplier's unit price. */
  unitGhs: number
  /** Transport for the load, as quoted. */
  transportGhs: number
  /** Transport spread across the quantity. */
  transportPerUnitGhs: number
  /** Unit price + transport per unit. */
  perUnitGhs: number
  /** Everything for the quantity: units + one load of transport. */
  totalGhs: number
  stale: boolean
  outOfStock: boolean
  /** Fresh and in stock: allowed to be the best price. */
  eligible: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function deliveredCosts(
  prices: Price[],
  suppliers: Supplier[],
  productId: string,
  quantity: number,
  asOf?: Date,
): DeliveredCost[] {
  const qty = Math.max(1, Math.floor(quantity) || 1)
  return prices
    .filter((p) => p.productId === productId && p.type === 'quoted')
    .map((price) => {
      const transport = price.transportGhs ?? 0
      const stale = isPriceStale(price, asOf)
      const outOfStock = price.inStock === false
      return {
        price,
        supplier: suppliers.find((s) => s.id === price.supplierId),
        unitGhs: price.ghs,
        transportGhs: transport,
        transportPerUnitGhs: round2(transport / qty),
        perUnitGhs: round2(price.ghs + transport / qty),
        totalGhs: round2(price.ghs * qty + transport),
        stale,
        outOfStock,
        eligible: !stale && !outOfStock,
      }
    })
    .sort((a, b) => a.perUnitGhs - b.perUnitGhs)
}

/** Cheapest eligible (fresh, in-stock) row; undefined when none qualifies. */
export function bestDelivered(rows: DeliveredCost[]): DeliveredCost | undefined {
  return rows.find((r) => r.eligible)
}

/** Most recent market reference observation for a product. */
export function marketReference(prices: Price[], productId: string): Price | undefined {
  return prices
    .filter((p) => p.productId === productId && p.type === 'market_reference')
    .sort((a, b) => b.capturedOn.localeCompare(a.capturedOn))[0]
}

export interface Savings {
  perUnitGhs: number
  totalGhs: number
  /** Fraction of the market price saved (negative = dearer than market). */
  pct: number
}

/**
 * Best delivered cost vs the market reference. The reference is a delivered
 * street price per unit, so it is compared with our per-unit delivered cost.
 */
export function savingsVsMarket(best: DeliveredCost | undefined, reference: Price | undefined, quantity: number): Savings | null {
  if (!best || !reference || reference.ghs <= 0) return null
  const qty = Math.max(1, Math.floor(quantity) || 1)
  const perUnit = round2(reference.ghs - best.perUnitGhs)
  return { perUnitGhs: perUnit, totalGhs: round2(perUnit * qty), pct: perUnit / reference.ghs }
}

/**
 * Human label for a product without repeating itself: spec parts already in
 * the name are dropped ("Cement, 50 kg bag" + "42.5R grade, 50 kg bag" ->
 * "GHACEM Cement, 50 kg bag · 42.5R grade").
 */
export function productLabel(p: Pick<Product, 'brand' | 'name' | 'spec'>): string {
  const name = p.name.toLowerCase()
  const extra = p.spec
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !name.includes(s.toLowerCase()))
  const base = p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.name : `${p.brand} ${p.name}`
  return extra.length > 0 ? `${base} · ${extra.join(', ')}` : base
}
