import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { demo } from '../data/demo'
// @ts-expect-error plain ESM server module, no type declarations
import real from '../../server/real-dataset.js'
import { CATEGORIES } from './shared'
import { SuppliersPage, sourceUrl } from './SuppliersPage'
import type { Supplier } from '../types'

const mapCalls: Supplier[][] = []
vi.mock('../components/SupplierMap', () => ({
  SupplierMap: ({ suppliers }: { suppliers: Supplier[] }) => {
    mapCalls.push(suppliers)
    return <div data-testid="map">{suppliers.length} markers</div>
  },
}))
vi.mock('recharts', async (orig) => {
  const mod = await orig<typeof import('recharts')>()
  return { ...mod, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})

describe('Suppliers page', () => {
  it('maps every supplier, not just the first table page (Safety and Tools included)', () => {
    render(<SuppliersPage data={demo} />)
    const plotted = mapCalls.at(-1)!
    expect(plotted).toHaveLength(demo.suppliers.length)
    expect(new Set(plotted.map((s) => s.category))).toEqual(new Set(CATEGORIES))
    expect(screen.getByTestId('map').textContent).toBe(`${demo.suppliers.length} markers`)
  })

  it('every supplier category in both datasets is a known category key', () => {
    for (const s of [...demo.suppliers, ...(real.suppliers as Supplier[])]) expect(CATEGORIES).toContain(s.category)
  })

  it('links only real URLs as sources', () => {
    expect(sourceUrl('https://dansoaa.com/')).toBe('https://dansoaa.com/')
    expect(sourceUrl('demo dataset')).toBeNull()
    expect(sourceUrl('javascript:alert(1)')).toBeNull()
    render(<SuppliersPage data={demo} />)
    expect(document.querySelector('a[href*="demo"]')).toBeNull()
    expect(screen.getAllByText('Source: demo dataset').length).toBeGreaterThan(0)
  })
})
