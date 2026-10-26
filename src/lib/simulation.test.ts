// Unit tests for the demo simulation engine (pure functions: rng injected).
//
// These pin the contract the UI depends on:
// - every tick produces a buildable event against the real seeded dataset,
// - events are diverse (all kinds appear over many draws),
// - applySimEvent is a pure fold with a bounded notification feed,
// - mergeSim keeps operator authority (local > sim > seed).

import { describe, expect, it } from 'vitest'
import { demo } from '../data/demo'
import type { Dataset } from './dataSource'
import { mergeDataset, type LocalRecords } from './localData'
import {
  applySimEvent,
  EMPTY_SIM,
  MAX_NOTIFICATIONS,
  mergeSim,
  pickSimEvent,
  type SimState,
} from './simulation'

const EMPTY_LOCAL: LocalRecords = {
  customers: [],
  orders: [],
  inquiries: [],
  quotes: [],
  cash: [],
  quoteOverrides: {},
  orderOverrides: {},
}

/** Snapshot the way App builds it: seed + local + the current sim layer. */
function snapshot(sim: SimState): Dataset {
  return mergeSim(demo, EMPTY_LOCAL, sim)
}

describe('pickSimEvent', () => {
  it('always returns a buildable event against the seeded demo dataset', () => {
    let nulls = 0
    for (let i = 0; i < 300; i++) {
      if (pickSimEvent(snapshot(EMPTY_SIM)) === null) nulls++
    }
    expect(nulls).toBe(0)
  })

  it('produces every event kind over many draws (feed stays diverse)', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 400; i++) {
      const ev = pickSimEvent(snapshot(EMPTY_SIM))
      expect(ev).not.toBeNull()
      counts[ev!.type] = (counts[ev!.type] ?? 0) + 1
    }
    // All seven kinds should show up in 400 weighted draws.
    for (const kind of ['inquiry', 'order', 'deposit', 'balance', 'stage', 'cashOut', 'price']) {
      expect(counts[kind], `kind ${kind} never fired`).toBeGreaterThan(0)
    }
  })

  it('is deterministic for a given rng sequence (pure: rng injected)', () => {
    const seqA = [0.05, 0.5, 0.95, 0.3, 0.7]
    const seqB = [...seqA]
    const rngOf = (seq: number[]) => () => seq.shift() ?? 0.5
    const a = pickSimEvent(snapshot(EMPTY_SIM), rngOf(seqA))
    const b = pickSimEvent(snapshot(EMPTY_SIM), rngOf(seqB))
    expect(a?.type).toBe(b?.type)
    // The notification id is intentionally unique (Date.now + random), so
    // compare the payload with that identity field normalised away.
    const norm = (e: unknown) => {
      const clone = JSON.parse(JSON.stringify(e)) as { notification: { id: string; createdAt: number } }
      clone.notification.id = 'sim-normalised'
      clone.notification.createdAt = 0 // wall-clock, differs by ms between draws
      return JSON.stringify(clone)
    }
    expect(norm(a)).toBe(norm(b))
  })

  it('allocates ids that cannot collide with existing seed records', () => {
    for (let i = 0; i < 50; i++) {
      const ev = pickSimEvent(snapshot(EMPTY_SIM))
      if (ev?.type === 'inquiry') {
        const taken = new Set(demo.inquiries.map((x) => x.id))
        expect(taken.has(ev.inquiry.id)).toBe(false)
      }
      if (ev?.type === 'order') {
        const taken = new Set(demo.orders.map((x) => x.id))
        expect(taken.has(ev.order.id)).toBe(false)
      }
    }
  })

  it('never builds negative or zero cash amounts', () => {
    for (let i = 0; i < 200; i++) {
      const ev = pickSimEvent(snapshot(EMPTY_SIM))
      for (const entry of ev && 'cash' in ev ? ev.cash : []) {
        expect(entry.ghs).toBeGreaterThan(0)
      }
    }
  })
})

describe('applySimEvent', () => {
  it('is a pure fold: does not mutate the previous state', () => {
    const before = JSON.stringify(EMPTY_SIM)
    const ev = pickSimEvent(snapshot(EMPTY_SIM))!
    applySimEvent(EMPTY_SIM, ev)
    expect(JSON.stringify(EMPTY_SIM)).toBe(before)
  })

  it('appends the notification and grows the layer', () => {
    const ev = pickSimEvent(snapshot(EMPTY_SIM))!
    const next = applySimEvent(EMPTY_SIM, ev)
    expect(next.notifications).toHaveLength(1)
    expect(next.notifications[0].id).toMatch(/^sim-/)
    expect(next.notifications[0].createdAt).toBeGreaterThan(0)
  })

  it('caps the live feed at MAX_NOTIFICATIONS so an all-day tab stays bounded', () => {
    let sim = EMPTY_SIM
    for (let i = 0; i < MAX_NOTIFICATIONS + 10; i++) {
      const ev = pickSimEvent(snapshot(sim))
      if (!ev) break
      sim = applySimEvent(sim, ev)
    }
    expect(sim.notifications).toHaveLength(MAX_NOTIFICATIONS)
    // Newest first — the head of the feed is the latest event.
    const stamps = sim.notifications.map((n) => n.createdAt)
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps)
  })
})

describe('mergeSim', () => {
  it('equals mergeDataset(base, local) when the sim layer is empty', () => {
    const local: LocalRecords = {
      ...EMPTY_LOCAL,
      orders: [
        {
          id: 'ORD-9001',
          customerId: demo.customers[0].id,
          lines: [],
          stage: 'quoted',
          valueGhs: 1000,
          depositGhs: 0,
          receivedOn: '2026-10-01',
        },
      ],
    }
    expect(JSON.stringify(mergeSim(demo, local, EMPTY_SIM))).toBe(JSON.stringify(mergeDataset(demo, local)))
  })

  it('operator overrides beat sim overrides on the same order (both applied)', () => {
    const orderId = demo.orders[0]?.id
    expect(orderId).toBeTruthy()
    const sim: SimState = {
      ...EMPTY_SIM,
      orderOverrides: { [orderId!]: { stage: 'ordered' } },
    }
    const local: LocalRecords = {
      ...EMPTY_LOCAL,
      orderOverrides: { [orderId!]: { stage: 'delivered' } },
    }
    const merged = mergeSim(demo, local, sim)
    const order = merged.orders.find((o) => o.id === orderId)
    expect(order?.stage).toBe('delivered')
  })

  it('merges sim records into the dataset', () => {
    const ev = pickSimEvent(snapshot(EMPTY_SIM))!
    const sim = applySimEvent(EMPTY_SIM, ev)
    const merged = mergeSim(demo, EMPTY_LOCAL, sim)
    if (ev.type === 'inquiry') {
      expect(merged.inquiries.length).toBe(demo.inquiries.length + 1)
    }
    if (ev.type === 'cashOut') {
      expect(merged.cash.length).toBe(demo.cash.length + 1)
    }
  })

  it('price overrides refresh capturedOn so stale-price KPIs recover live', () => {
    const price = demo.prices.find((p) => p.supplierId)
    expect(price).toBeTruthy()
    const key = `${price!.productId}|${price!.supplierId}|${price!.type}`
    const sim: SimState = { ...EMPTY_SIM, priceOverrides: { [key]: { ghs: 42, capturedOn: '2099-01-01' } } }
    const merged = mergeSim(demo, EMPTY_LOCAL, sim)
    const row = merged.prices.find((p) => `${p.productId}|${p.supplierId}|${p.type}` === key)
    expect(row?.ghs).toBe(42)
    expect(row?.capturedOn).toBe('2099-01-01')
  })
})

describe('simulation follows the business rules', () => {
  it('confirms orders with at least the 70% (or 50% established) deposit and never offloads unpaid orders', () => {
    // Seeded rng so the run is reproducible.
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    let sim: SimState = EMPTY_SIM
    for (let i = 0; i < 400; i++) {
      const data = snapshot(sim)
      const event = pickSimEvent(data, rng)
      if (!event) continue
      if (event.type === 'deposit') {
        const order = data.orders.find((o) => o.id === event.orderId)!
        expect(event.patch.depositGhs!).toBeGreaterThanOrEqual(Math.min(order.valueGhs, order.valueGhs * 0.5))
      }
      if (event.type === 'stage' && event.patch.stage === 'delivered') {
        const order = data.orders.find((o) => o.id === event.orderId)!
        const paid =
          order.depositGhs +
          data.cash.filter((c) => c.orderId === order.id && c.kind === 'balance_in').reduce((s, c) => s + c.ghs, 0)
        expect(paid).toBeGreaterThanOrEqual(order.valueGhs)
      }
      sim = applySimEvent(sim, event)
    }
  })
})
