// The same label must show the same number on every page that carries it.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { demo } from '../data/demo'
import { computeMetrics } from '../lib/metrics'
import { CashTrackerPage } from './CashTrackerPage'
import { DashboardPage } from './DashboardPage'
import { OrdersPage } from './OrdersPage'
import { ghs } from './shared'

// Recharts needs a measured container; jsdom has none.
vi.mock('recharts', async (orig) => {
  const mod = await orig<typeof import('recharts')>()
  return { ...mod, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})

const m = computeMetrics(demo)
const noop = () => {}

function cardValue(label: string): string {
  const el = screen.getAllByText(label)[0]
  const card = el.closest('button, div.rounded-xl') as HTMLElement
  return within(card).getAllByText(/GH¢|^\d+$/)[0].textContent ?? ''
}

describe('shared metric definitions', () => {
  it('Dashboard, Orders and Cash agree on still to collect', () => {
    const { unmount: u1 } = render(<DashboardPage data={demo} onNavigate={noop} />)
    expect(cardValue('Still to collect')).toBe(ghs(m.money.stillToCollect))
    u1()
    const { unmount: u2 } = render(<OrdersPage data={demo} onNavigate={noop} onOrderAction={noop} />)
    expect(cardValue('Still to collect')).toBe(ghs(m.money.stillToCollect))
    u2()
    render(<CashTrackerPage data={demo} onNavigate={noop} onAddCash={noop} />)
    expect(cardValue('Still to collect')).toBe(ghs(m.money.stillToCollect))
  })

  it('Dashboard and Orders agree on orders in motion; Dashboard and Cash on cash on hand', () => {
    const { unmount: u1 } = render(<DashboardPage data={demo} onNavigate={noop} />)
    expect(cardValue('Orders in motion')).toBe(String(m.orders.inMotion.length))
    expect(cardValue('Cash on hand')).toBe(ghs(m.money.cashOnHand))
    u1()
    const { unmount: u2 } = render(<OrdersPage data={demo} onNavigate={noop} onOrderAction={noop} />)
    expect(cardValue('Orders in motion')).toBe(String(m.orders.inMotion.length))
    u2()
    render(<CashTrackerPage data={demo} onNavigate={noop} onAddCash={noop} />)
    expect(cardValue('Cash on hand')).toBe(ghs(m.money.cashOnHand))
  })
})
