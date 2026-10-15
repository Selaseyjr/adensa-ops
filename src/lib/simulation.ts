// Demo simulation engine — makes the demo feel alive.
//
// Every few seconds a weighted event fires: a new inquiry lands, an order is
// placed, a deposit or balance payment arrives, an order moves stage, a
// supplier or expense payment goes out, or a supplier reprices a product.
// Each event both (a) mutates the merged dataset, so every page's numbers
// move up AND down over time, and (b) appends a notification to the bell.
//
// Rules that the rest of the app relies on:
// - Demo mode ONLY. App enables the hook with `mode === 'demo'`; real mode
//   never renders simulated records or notifications (privacy rule in
//   AGENTS.md). The hook clears its layer whenever it is disabled.
// - Simulation state is a separate overlay (not written to localStorage), so
//   a fresh load starts from the seed + the operator's own records only.
// - Events are built from the fully merged snapshot (seed + local + sim), so
//   ids allocated here can never collide with ids the operator creates.
// - pickSimEvent/applySimEvent are pure (rng injected) for unit testing.

import { useEffect, useRef, useState } from 'react'
import type { CashEntry, Inquiry, Order, Product } from '../types'
import { priceKey } from '../types'
import type { Dataset } from './dataSource'
import { mergeDataset, nextCashId, nextOrderId, type LocalRecords, type OrderOverride } from './localData'
import type { AppNotification } from './notifications'

/** A live notification: same as AppNotification but timestamped so it ages. */
export interface SimNotification extends Omit<AppNotification, 'minutesAgo'> {
  createdAt: number
}

/** Session-only overlay merged over seed + operator records. */
export interface SimState {
  orders: Order[]
  orderOverrides: Record<string, OrderOverride>
  inquiries: Inquiry[]
  cash: CashEntry[]
  priceOverrides: Record<string, { ghs: number; capturedOn: string }>
  notifications: SimNotification[]
}

export const EMPTY_SIM: SimState = {
  orders: [],
  orderOverrides: {},
  inquiries: [],
  cash: [],
  priceOverrides: {},
  notifications: [],
}

/** Cap the live feed so an all-day open tab cannot grow it without bound. */
export const MAX_NOTIFICATIONS = 16
/** New-order generation stops here; flows on existing orders keep firing. */
const MAX_SIM_ORDERS = 80

// Timing -------------------------------------------------------------------------
/** First event arrives quickly so movement is visible, then a steady rhythm. */
const FAST_PARAM = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sim') : null
export const FIRST_DELAY_MS = FAST_PARAM === 'fast' ? 1_200 : 9_000
export const TICK_MIN_MS = FAST_PARAM === 'fast' ? 1_500 : 12_000
export const TICK_SPREAD_MS = FAST_PARAM === 'fast' ? 1_000 : 13_000

// Event shape ---------------------------------------------------------------------

export type SimEvent =
  | { type: 'inquiry'; inquiry: Inquiry; notification: SimNotification }
  | { type: 'order'; order: Order; notification: SimNotification }
  | { type: 'deposit'; orderId: string; patch: OrderOverride; cash: CashEntry[]; notification: SimNotification }
  | { type: 'balance'; orderId: string; patch?: OrderOverride; cash: CashEntry[]; notification: SimNotification }
  | { type: 'stage'; orderId: string; patch: OrderOverride; notification: SimNotification }
  | { type: 'cashOut'; cash: CashEntry[]; notification: SimNotification }
  | {
      type: 'price'
      key: string
      override: { ghs: number; capturedOn: string }
      notification: SimNotification
    }

// Weighted mix (sums to 100) ------------------------------------------------------
const WEIGHTS: Record<SimEvent['type'], number> = {
  inquiry: 16,
  order: 13,
  deposit: 15,
  balance: 11,
  stage: 13,
  cashOut: 20, // supplier payments (11) + expenses (9) share a slot below
  price: 12,
}

// Small helpers ---------------------------------------------------------------------

const roundTo = (n: number, step: number): number => Math.round(n / step) * step

const pick = <T>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)]

function notif(
  kind: AppNotification['kind'],
  title: string,
  message: string,
  target: AppNotification['target'],
): SimNotification {
  return { id: `sim-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, kind, title, message, target, createdAt: Date.now() }
}

function inquiryId(existing: Inquiry[]): string {
  let max = 0
  for (const i of existing) {
    const m = /^d-inq-(\d+)$/.exec(i.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `d-inq-${String(max + 1).padStart(3, '0')}`
}

const INQUIRY_CHANNELS = ['customer app', 'phone', 'whatsapp', 'walk-in'] as const
const EXPENSE_LABELS = [
  'Delivery fuel',
  'Printing and stationery',
  'Internet and airtime',
  'Site handling charges',
  'Fleet maintenance',
] as const

function weightPick(rng: () => number): SimEvent['type'] {
  const entries = Object.entries(WEIGHTS) as [SimEvent['type'], number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rng() * total
  for (const [type, w] of entries) {
    roll -= w
    if (roll <= 0) return type
  }
  return 'cashOut'
}

/** Cash received against an order so far (deposit entries + balance entries). */
function cashReceived(orderId: string, allCash: CashEntry[]): number {
  return allCash.filter((c) => c.orderId === orderId).reduce((s, c) => s + c.ghs, 0)
}

/**
 * Build the next event from the FULLY MERGED snapshot (seed + operator
 * records + current sim layer). Returns null only when nothing is buildable.
 * Pure apart from rng: same data + same rng sequence => same event.
 */
export function pickSimEvent(data: Dataset, rng: () => number = Math.random): SimEvent | null {
  const type = weightPick(rng)
  const today = localToday()
  const customers = data.customers

  const buildCashOut = (): SimEvent | null => {
    const supplierPay = type === 'cashOut' && rng() < 0.55
    if (supplierPay && data.suppliers.length > 0) {
      const supplier = pick(data.suppliers, rng)
      const amount = roundTo(2_000 + rng() * 23_000, 10)
      const entry: CashEntry = {
        id: nextCashId(data.cash, 'demo'),
        date: today,
        kind: 'supplier_out',
        ghs: amount,
        label: `${supplier.name} stock payment`,
      }
      return {
        type: 'cashOut',
        cash: [entry],
        notification: notif(
          'supplier',
          'Supplier payment',
          `GH\u00a2${amount.toLocaleString('en-GH')} paid to ${supplier.name} for stock.`,
          'cash',
        ),
      }
    }
    const label = pick(EXPENSE_LABELS, rng)
    const amount = roundTo(80 + rng() * 820, 10)
    const entry: CashEntry = {
      id: nextCashId(data.cash, 'demo'),
      date: today,
      kind: 'expense_out',
      ghs: amount,
      label,
    }
    return {
      type: 'cashOut',
      cash: [entry],
      notification: notif('expense', 'Expense recorded', `GH\u00a2${amount.toLocaleString('en-GH')} recorded for ${label.toLowerCase()}.`, 'cash'),
    }
  }

  const buildPrice = (): SimEvent | null => {
    const list = data.prices.filter((p) => p.supplierId)
    if (list.length === 0) return buildCashOut()
    const price = pick(list, rng)
    const supplier = data.suppliers.find((s) => s.id === price.supplierId)
    const product = data.products.find((p) => p.id === price.productId)
    const up = rng() < 0.5
    const delta = 0.02 + rng() * 0.04 // 2-6%
    const next = roundTo(price.ghs * (up ? 1 + delta : 1 - delta), 0.5)
    const unitWord = product ? ` per ${product.unit}` : ''
    return {
      type: 'price',
      key: priceKey(price),
      override: { ghs: next, capturedOn: today },
      notification: notif(
        'price',
        'Supplier price updated',
        `${describeProduct(product)} repriced at GH\u00a2${next}${unitWord} by ${supplier?.name ?? 'supplier'}, ${up ? 'up' : 'down'} from GH\u00a2${price.ghs}.`,
        'compare',
      ),
    }
  }

  const buildInquiry = (): SimEvent | null => {
    if (customers.length === 0) return buildCashOut()
    const customer = pick(customers, rng)
    const product = data.products.length > 0 ? pick(data.products, rng) : null
    const qty = pick([10, 20, 25, 50, 100], rng)
    const channel = pick([...INQUIRY_CHANNELS], rng)
    const desc = product ? `${product.brand} ${product.name.toLowerCase()}, ${qty} ${product.unit}s` : `${qty} units`
    const inquiry: Inquiry = {
      id: inquiryId(data.inquiries),
      customerName: customer.name,
      customerId: customer.id,
      category: product ? product.category : customer.productsNeeded[0] ?? 'cement',
      description: `${desc}, ${customer.city} site`,
      receivedOn: today,
      channel,
      status: 'new',
    }
    return {
      type: 'inquiry',
      inquiry,
      notification: notif(
        'inquiry',
        'New customer inquiry',
        `${customer.name} requested ${desc} ${channel === 'customer app' ? 'through the customer-facing app' : `by ${channel}`}.`,
        'customers',
      ),
    }
  }

  const buildOrder = (): SimEvent | null => {
    if (customers.length === 0 || data.prices.length === 0) return buildInquiry()
    if (data.orders.filter((o) => /^ORD-\d+$/.test(o.id)).length >= MAX_SIM_ORDERS) return buildCashOut()
    const customer = pick(customers, rng)
    const priced = data.prices.filter((p) => p.supplierId)
    if (priced.length === 0) return buildInquiry()
    const price = pick(priced, rng)
    const product = data.products.find((p) => p.id === price.productId)
    const qty = pick([10, 20, 30, 50], rng)
    const delivery = roundTo(300 + rng() * 700, 50)
    const order: Order = {
      id: nextOrderId(data.orders),
      customerId: customer.id,
      lines: [
        { productId: price.productId, description: describeProduct(product), qty, unitGhs: price.ghs },
        { description: 'Delivery within city', qty: 1, unitGhs: delivery },
      ],
      stage: 'quoted',
      valueGhs: qty * price.ghs + delivery,
      depositGhs: 0,
      receivedOn: today,
    }
    return {
      type: 'order',
      order,
      notification: notif(
        'order',
        'Order received',
        `Order ${order.id} placed by ${customer.name}, deposit pending.`,
        'orders',
      ),
    }
  }

  const buildDeposit = (): SimEvent | null => {
    const candidates = data.orders.filter((o) => o.stage === 'quoted' && o.depositGhs === 0)
    if (candidates.length === 0) return buildOrder()
    const order = pick(candidates, rng)
    const customer = customers.find((c) => c.id === order.customerId)
    const amount = roundTo(order.valueGhs * (0.4 + rng() * 0.2), 10)
    const entry: CashEntry = {
      id: nextCashId(data.cash, 'demo'),
      date: today,
      kind: 'deposit_in',
      ghs: amount,
      label: `Deposit for ${order.id} (${customer?.name ?? 'customer'})`,
      orderId: order.id,
    }
    return {
      type: 'deposit',
      orderId: order.id,
      patch: { stage: 'deposit', depositGhs: amount },
      cash: [entry],
      notification: notif(
        'payment',
        'Payment received',
        `GH\u00a2${amount.toLocaleString('en-GH')} deposit received for ${order.id} (${customer?.name ?? 'customer'}).`,
        'cash',
      ),
    }
  }

  const buildBalance = (): SimEvent | null => {
    // Money can arrive at any stage after deposit, but an order is only
    // settled once it has been delivered (partial payments never skip the
    // delivery step).
    const candidates = data.orders.filter(
      (o) => o.stage !== 'quoted' && o.stage !== 'settled' && o.stage !== 'draft' && cashReceived(o.id, data.cash) < o.valueGhs,
    )
    if (candidates.length === 0) return buildDeposit()
    const order = pick(candidates, rng)
    const customer = customers.find((c) => c.id === order.customerId)
    const outstanding = Math.max(0, order.valueGhs - cashReceived(order.id, data.cash))
    const willSettle = order.stage === 'delivered'
    // Delivered: collect the remainder and settle. Earlier: partial payment
    // of 30-70% of what is outstanding, leaving delivery/settlement to flow.
    const frac = willSettle ? 1 : 0.3 + rng() * 0.4
    const amount = Math.max(10, Math.min(outstanding, roundTo(outstanding * frac, 10)))
    const entry: CashEntry = {
      id: nextCashId(data.cash, 'demo'),
      date: today,
      kind: 'balance_in',
      ghs: amount,
      label: willSettle
        ? `Final balance, ${order.id} (${customer?.name ?? 'customer'})`
        : `Balance received, ${order.id} (${customer?.name ?? 'customer'})`,
      orderId: order.id,
    }
    return {
      type: 'balance',
      orderId: order.id,
      // Receivable is value - depositGhs - balance entries, so the balance
      // entry alone drives it to zero; depositGhs stays truthful.
      patch: willSettle ? { stage: 'settled' } : undefined,
      cash: [entry],
      notification: notif(
        'payment',
        'Payment received',
        willSettle
          ? `GH¢${amount.toLocaleString('en-GH')} final balance received. Order ${order.id} fully settled.`
          : `GH¢${amount.toLocaleString('en-GH')} balance received for ${order.id} (${customer?.name ?? 'customer'}).`,
        'cash',
      ),
    }
  }

  const buildStage = (): SimEvent | null => {
    const delivering = data.orders.filter((o) => o.stage === 'ordered')
    if (delivering.length > 0) {
      const order = pick(delivering, rng)
      const customer = customers.find((c) => c.id === order.customerId)
      return {
        type: 'stage',
        orderId: order.id,
        patch: { stage: 'delivered', completedOn: today, receipt: { on: today, condition: 'complete' } },
        notification: notif(
          'delivery',
          'Order delivered',
          `${order.id} delivered to ${customer?.name ?? 'customer'}. Receipt captured.`,
          'orders',
        ),
      }
    }
    const releasing = data.orders.filter((o) => o.stage === 'deposit')
    if (releasing.length > 0) {
      const order = pick(releasing, rng)
      return {
        type: 'stage',
        orderId: order.id,
        patch: { stage: 'ordered' },
        notification: notif('order', 'Order placed with supplier', `${order.id} released to the supplier for fulfilment.`, 'orders'),
      }
    }
    return buildDeposit()
  }

  switch (type) {
    case 'inquiry':
      return buildInquiry()
    case 'order':
      return buildOrder()
    case 'deposit':
      return buildDeposit()
    case 'balance':
      return buildBalance()
    case 'stage':
      return buildStage()
    case 'cashOut':
      return buildCashOut()
    case 'price':
      return buildPrice()
    default:
      return null
  }
}

function describeProduct(product: Product | undefined): string {
  if (!product) return 'Product'
  return `${product.brand} ${product.name.toLowerCase()}`
}

/** Local calendar date (same convention as localData.localDate). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fold an event into the overlay. Pure: (state, event) => new state. */
export function applySimEvent(state: SimState, event: SimEvent): SimState {
  const notifications = [event.notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS)
  switch (event.type) {
    case 'inquiry':
      return { ...state, inquiries: [...state.inquiries, event.inquiry], notifications }
    case 'order':
      return { ...state, orders: [...state.orders, event.order], notifications }
    case 'deposit':
      return {
        ...state,
        orderOverrides: { ...state.orderOverrides, [event.orderId]: { ...state.orderOverrides[event.orderId], ...event.patch } },
        cash: [...state.cash, ...event.cash],
        notifications,
      }
    case 'balance':
      return {
        ...state,
        orderOverrides: event.patch
          ? { ...state.orderOverrides, [event.orderId]: { ...state.orderOverrides[event.orderId], ...event.patch } }
          : state.orderOverrides,
        cash: [...state.cash, ...event.cash],
        notifications,
      }
    case 'stage':
      return {
        ...state,
        orderOverrides: { ...state.orderOverrides, [event.orderId]: { ...state.orderOverrides[event.orderId], ...event.patch } },
        notifications,
      }
    case 'cashOut':
      return { ...state, cash: [...state.cash, ...event.cash], notifications }
    case 'price':
      return { ...state, priceOverrides: { ...state.priceOverrides, [event.key]: event.override }, notifications }
    default:
      return state
  }
}

// Hook ------------------------------------------------------------------------------

/**
 * Drives the loop. `getSnapshot(sim)` must return the dataset the next event
 * should be built from (seed + operator records + the passed sim layer).
 * Disabled whenever mode is not demo: the layer resets to EMPTY_SIM.
 */
export function useSimulation(
  enabled: boolean,
  getSnapshot: (sim: SimState) => Dataset,
): { layer: SimState; notifications: SimNotification[] } {
  const [sim, setSim] = useState<SimState>(EMPTY_SIM)
  const simRef = useRef(sim)
  const snapRef = useRef(getSnapshot)
  snapRef.current = getSnapshot // always call the latest closure

  useEffect(() => {
    if (!enabled) {
      simRef.current = EMPTY_SIM
      setSim(EMPTY_SIM)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const schedule = (ms: number) => {
      timer = setTimeout(tick, ms)
    }
    const tick = () => {
      if (cancelled) return
      const prev = simRef.current
      const event = pickSimEvent(snapRef.current(prev), Math.random)
      if (event) {
        const next = applySimEvent(prev, event)
        simRef.current = next
        setSim(next)
      }
      schedule(TICK_MIN_MS + Math.random() * TICK_SPREAD_MS)
    }
    schedule(FIRST_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled])

  return { layer: sim, notifications: sim.notifications }
}

// Merge ---------------------------------------------------------------------------

/**
 * Seed + operator records + sim overlay, with operator authority:
 * - operator overrides beat sim overrides on the same order (both applied,
 *   operator fields last),
 * - sim records never reach localStorage (session overlay only),
 * - priceOverrides refresh capturedOn, so stale-price KPIs recover live.
 * With an empty sim layer this is exactly mergeDataset(base, local).
 */
export function mergeSim(base: Dataset, local: LocalRecords, sim: SimState): Dataset {
  const hasSim =
    sim.orders.length > 0 ||
    sim.inquiries.length > 0 ||
    sim.cash.length > 0 ||
    Object.keys(sim.orderOverrides).length > 0 ||
    Object.keys(sim.priceOverrides).length > 0
  if (!hasSim) return mergeDataset(base, local)

  const quotes = mergeDataset(base, local).quotes
  const orders = [...base.orders, ...sim.orders, ...local.orders].map((o) => {
    const s = sim.orderOverrides[o.id]
    const l = local.orderOverrides[o.id]
    const withSim = s ? { ...o, ...s } : o
    return l ? { ...withSim, ...l } : withSim
  })
  const prices = base.prices.map((p) => {
    const ov = sim.priceOverrides[priceKey(p)]
    return ov ? { ...p, ...ov } : p
  })
  return {
    ...base,
    quotes,
    orders,
    prices,
    inquiries: [...base.inquiries, ...sim.inquiries, ...local.inquiries],
    cash: [...base.cash, ...sim.cash, ...local.cash],
    customers: [...base.customers, ...local.customers],
  }
}
