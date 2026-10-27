// The app edition (real platform) in a real browser. The worker API is
// mocked with page.route and a tiny synthetic dataset: these tests prove the
// sign-in flow and what each position can reach, never touch real records,
// and need no backend.

import { expect, test, type Page } from '@playwright/test'

const DATASET = {
  suppliers: [{ id: 'sup-t1', name: 'Fixture Hardware', category: 'cement', location: 'Tudu', city: 'Accra', status: 'identified', delivery: 'unknown' }],
  products: [],
  prices: [],
  customers: [{ id: 'cus-t1', name: 'Fixture Builders', city: 'Accra', type: 'contractor', productsNeeded: ['cement'] }],
  orders: [
    {
      id: 'ORD-9001',
      customerId: 'cus-t1',
      lines: [{ description: 'Cement', qty: 10, unitGhs: 100 }],
      stage: 'quoted',
      valueGhs: 1000,
      depositGhs: 0,
      receivedOn: '2026-10-20',
    },
  ],
  inquiries: [],
  quotes: [],
  cash: [],
  meta: { month: '2026-10', revenueTargetGhs: 0, openingCashGhs: 0 },
}

type Role = 'product_lead' | 'operations_manager' | 'secretary'
const ACCOUNTS: Record<string, { name: string; role: Role; password: string; mustChangePassword?: boolean }> = {
  'lead@adensa.test': { name: 'Ama Lead', role: 'product_lead', password: 'lead-password-1' },
  'ops@adensa.test': { name: 'Kofi Ops', role: 'operations_manager', password: 'ops-password-1' },
  'sec@adensa.test': { name: 'Esi Sec', role: 'secretary', password: 'sec-password-1' },
  'new@adensa.test': { name: 'Yaw New', role: 'secretary', password: 'temporary-pass-1', mustChangePassword: true },
}

async function mockApi(page: Page) {
  const calls: string[] = []
  let current: string | null = null
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push(`${req.method()} ${url.pathname}`)
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const user = (email: string) => {
      const a = ACCOUNTS[email]
      return { id: email, email, name: a.name, role: a.role, active: true, mustChangePassword: !!a.mustChangePassword }
    }
    const authed = req.headers().authorization === 'Bearer tok' && current
    if (url.pathname === '/api/auth/login') {
      const { email, password } = req.postDataJSON() as { email: string; password: string }
      const a = ACCOUNTS[email]
      if (!a || a.password !== password) return json({ ok: false, error: 'incorrect email or password' }, 401)
      current = email
      return json({ ok: true, token: 'tok', expiresAt: Date.now() + 3_600_000, user: user(email) })
    }
    if (!authed) return json({ ok: false, error: 'sign-in required' }, 401)
    if (url.pathname === '/api/auth/me') return json({ ok: true, user: user(current!) })
    if (url.pathname === '/api/auth/password') {
      ACCOUNTS[current!].mustChangePassword = false
      return json({ ok: true, token: 'tok', expiresAt: Date.now() + 3_600_000, user: user(current!) })
    }
    if (url.pathname === '/api/staff') {
      return json({ ok: true, staff: Object.keys(ACCOUNTS).map(user) })
    }
    if (url.pathname === '/api/real-dataset') return json({ ok: true, dataset: DATASET })
    if (url.pathname === '/api/records') return json({ ok: true, mode: 'real', records: null, updatedAt: null })
    return json({ ok: false }, 404)
  })
  return calls
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('opens on the sign-in screen with nothing else rendered', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in to AdensaOps' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await expect(page.getByLabel('Access PIN')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View the public demo' })).toHaveAttribute('href', 'https://demo.adensaops.com')
})

test('a wrong password is refused; the Product Lead gets everything, including Team', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto('/')
  await signIn(page, 'lead@adensa.test', 'wrong-password')
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')

  await signIn(page, 'lead@adensa.test', 'lead-password-1')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeVisible()
  await expect.poll(() => calls).toContain('GET /api/real-dataset')
  for (const item of ['Dashboard', 'Orders', 'Quotes', 'Suppliers', 'Compare prices', 'Cash', 'Customers', 'Team']) {
    await expect(nav.getByRole('button', { name: item })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Account: Ama Lead, Product Lead' })).toBeVisible()

  // Real data only, no demo chrome.
  await page.goto('/suppliers')
  await expect(page.getByText('Fixture Hardware')).toBeVisible()
  await expect(page.getByText('Samaritan Building Supplies')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'About this project' })).toHaveCount(0)

  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
  await expect(page.getByText('Kofi Ops')).toBeVisible()

  // Sign out from the account menu.
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to AdensaOps' })).toBeVisible()
})

test('the Secretary sees customers, quotes and orders, but no cash, prices or money actions', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await signIn(page, 'sec@adensa.test', 'sec-password-1')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeVisible()
  for (const item of ['Dashboard', 'Orders', 'Quotes', 'Suppliers', 'Customers']) {
    await expect(nav.getByRole('button', { name: item })).toBeVisible()
  }
  for (const item of ['Cash', 'Compare prices', 'Team']) {
    await expect(nav.getByRole('button', { name: item })).toHaveCount(0)
  }
  // No cash figures on the dashboard, and the cash route is closed.
  await expect(page.getByText('Cash on hand')).toHaveCount(0)
  await page.goto('/cash')
  await expect(page).toHaveURL(/\/$/)
  // Orders: can open, cannot record money.
  await page.goto('/orders')
  await page.getByRole('button', { name: 'Open ORD-9001' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record deposit' })).toHaveCount(0)
})

test('the Operations Manager has money actions but no Team page', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await signIn(page, 'ops@adensa.test', 'ops-password-1')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('button', { name: 'Cash' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Team' })).toHaveCount(0)
  await page.goto('/orders')
  await page.getByRole('button', { name: 'Open ORD-9001' }).click()
  await expect(page.getByRole('button', { name: 'Record deposit' })).toBeVisible()
})

test('a new account must choose its own password before anything else', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await signIn(page, 'new@adensa.test', 'temporary-pass-1')
  await expect(page.getByRole('heading', { name: 'Welcome, Yaw' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await page.getByLabel('Current password').fill('temporary-pass-1')
  await page.getByLabel('New password', { exact: true }).fill('my-own-password-1')
  await page.getByLabel('Confirm new password').fill('my-own-password-1')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('a session the server no longer accepts returns to sign-in', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  // A session the server no longer accepts (set once, so sign-out really clears it).
  await page.evaluate(() =>
    localStorage.setItem(
      'adensa.staffSession',
      JSON.stringify({
        token: 'stale',
        expiresAt: Date.now() + 60_000,
        user: { id: 'x', email: 'x@adensa.test', name: 'X', role: 'secretary', active: true, mustChangePassword: false },
      }),
    ),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in to AdensaOps' })).toBeVisible()
})
