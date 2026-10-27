// The app edition (real platform) in a real browser. The worker API is
// mocked with page.route and a tiny synthetic dataset: these tests prove the
// edition's behaviour, never touch real records, and need no backend.

import { expect, test, type Page } from '@playwright/test'

const DATASET = {
  suppliers: [{ id: 'sup-t1', name: 'Fixture Hardware', category: 'cement', location: 'Tudu', city: 'Accra', status: 'identified', delivery: 'unknown' }],
  products: [],
  prices: [],
  customers: [{ id: 'cus-t1', name: 'Fixture Builders', city: 'Accra', type: 'contractor', productsNeeded: ['cement'] }],
  orders: [],
  inquiries: [],
  quotes: [],
  cash: [],
  meta: { month: '2026-10', revenueTargetGhs: 0, openingCashGhs: 0 },
}

async function mockApi(page: Page) {
  const calls: string[] = []
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push(`${req.method()} ${url.pathname}`)
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/api/session') {
      const { pin } = req.postDataJSON() as { pin: string }
      return pin === 'right-pin'
        ? json({ ok: true, token: 'real.9999999999999.sig', expiresAt: Date.now() + 3_600_000 })
        : json({ ok: false, error: 'incorrect PIN' }, 401)
    }
    if (url.pathname === '/api/real-dataset') {
      return req.headers().authorization === 'Bearer real.9999999999999.sig'
        ? json({ ok: true, dataset: DATASET })
        : json({ ok: false }, 401)
    }
    if (url.pathname === '/api/records') return json({ ok: true, mode: 'real', records: null, updatedAt: null })
    return json({ ok: false }, 404)
  })
  return calls
}

test('opens on the sign-in screen with nothing else rendered', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in to AdensaOps' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View the public demo' })).toHaveAttribute('href', 'https://demo.adensaops.com')
})

test('a wrong PIN is refused; the right one loads real records only', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto('/')
  await page.getByLabel('Access PIN').fill('nope')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Incorrect PIN.')

  await page.getByLabel('Access PIN').fill('right-pin')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect.poll(() => calls).toContain('GET /api/real-dataset')

  // Real data, no demo seed, no simulation, no demo chrome.
  await page.goto('/suppliers')
  await expect(page.getByText('Fixture Hardware')).toBeVisible()
  await expect(page.getByText('Samaritan Building Supplies')).toHaveCount(0)
  await expect(page.getByText(/^Demo$/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'About this project' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Notifications, none unread' })).toBeVisible()

  // Sign out returns to the sign-in screen.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to AdensaOps' })).toBeVisible()
})

test('an expired session shows a clear error instead of empty screens', async ({ page }) => {
  await mockApi(page)
  // A token the server no longer accepts (set once, so sign-out really clears it).
  await page.goto('/')
  await page.evaluate(() =>
    sessionStorage.setItem('adensa.realSession', JSON.stringify({ token: 'stale', expiresAt: Date.now() + 60_000 })),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Records could not be loaded' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in again' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to AdensaOps' })).toBeVisible()
})
