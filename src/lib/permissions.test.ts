import { describe, expect, it } from 'vitest'
import { ROLES as SERVER_ROLES } from '../../server/staff.js'
import { can, ROLES } from './permissions'

describe('positions and permissions', () => {
  it('the app and the worker know the same three positions', () => {
    expect(ROLES).toEqual(SERVER_ROLES)
    expect(ROLES).toEqual(['product_lead', 'operations_manager', 'secretary'])
  })

  it('only the Product Lead manages the team', () => {
    expect(can('product_lead', 'team:manage')).toBe(true)
    expect(can('operations_manager', 'team:manage')).toBe(false)
    expect(can('secretary', 'view:team')).toBe(false)
  })

  it('the Operations Manager runs all operations, including money and cash', () => {
    for (const p of ['orders:approve', 'orders:money', 'orders:deliver', 'view:cash', 'cash:record', 'view:compare'] as const) {
      expect(can('operations_manager', p)).toBe(true)
    }
  })

  it('the Secretary handles customers, quotes and deliveries, but not money or cash', () => {
    for (const p of ['view:customers', 'quotes:create', 'quotes:decide', 'view:orders', 'orders:deliver'] as const) {
      expect(can('secretary', p)).toBe(true)
    }
    for (const p of ['orders:money', 'orders:approve', 'view:cash', 'cash:record', 'view:compare'] as const) {
      expect(can('secretary', p)).toBe(false)
    }
  })
})
