// What each position may see and do in the real platform. One table, used
// by navigation, routes and actions, so the three roles stay consistent.
//
// The worker enforces sign-in on every real-data request and restricts team
// management to the Product Lead. Per-action checks (who may record money)
// are enforced in the interface today and move to the server together with
// the per-record database (roadmap step 3).

export type Role = 'product_lead' | 'operations_manager' | 'secretary'

export const ROLES: Role[] = ['product_lead', 'operations_manager', 'secretary']

export const ROLE_LABELS: Record<Role, string> = {
  product_lead: 'Product Lead',
  operations_manager: 'Operations Manager',
  secretary: 'Secretary',
}

export type Permission =
  // Pages
  | 'view:dashboard'
  | 'view:orders'
  | 'view:quotes'
  | 'view:suppliers'
  | 'view:compare'
  | 'view:cash'
  | 'view:customers'
  | 'view:team'
  // Actions
  | 'orders:approve' // approve drafts, edit, place supplier orders
  | 'orders:money' // record deposits, payments, collect balances, close
  | 'orders:deliver' // record a delivery receipt
  | 'quotes:create'
  | 'quotes:decide' // record the customer's accept / decline
  | 'cash:record'
  | 'team:manage'

const ALL_PAGES: Permission[] = [
  'view:dashboard',
  'view:orders',
  'view:quotes',
  'view:suppliers',
  'view:compare',
  'view:cash',
  'view:customers',
]

export const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  product_lead: new Set<Permission>([
    ...ALL_PAGES,
    'view:team',
    'orders:approve',
    'orders:money',
    'orders:deliver',
    'quotes:create',
    'quotes:decide',
    'cash:record',
    'team:manage',
  ]),
  operations_manager: new Set<Permission>([
    ...ALL_PAGES,
    'orders:approve',
    'orders:money',
    'orders:deliver',
    'quotes:create',
    'quotes:decide',
    'cash:record',
  ]),
  secretary: new Set<Permission>([
    'view:dashboard',
    'view:orders',
    'view:quotes',
    'view:suppliers',
    'view:customers',
    'orders:deliver',
    'quotes:create',
    'quotes:decide',
  ]),
}

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.has(permission) ?? false
}

export interface StaffUser {
  id: string
  email: string
  name: string
  role: Role
  active: boolean
  mustChangePassword: boolean
}
