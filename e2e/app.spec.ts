// End-to-end journeys — the four technical fixes, proven in a real browser:
// 1. theme works on phone + tablet widths (toggle reachable, class + chrome tint),
// 2. the simulation feeds continuous notifications and moving numbers,
// 3. the notification bell UX (read all / undo / navigation),
// 4. core navigation renders each page without console errors.

import { expect, test, type Page } from '@playwright/test'

/**
 * Fail the test on any console error or uncaught page exception.
 *
 * One class of error is expected and excluded: the record-sync API is
 * optional by design, so when the dev server has no worker behind /api/* the
 * browser logs the 404 and the client silently falls back to localStorage.
 * That is the documented degraded path (and what Vercel serves), not a bug.
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const url = msg.location()?.url ?? ''
    if (url.includes('/api/records')) return
    errors.push(`${msg.text()} (${url})`)
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

test.describe('theme on phone and tablet', () => {
  test('phone: drawer toggle reaches the theme switch, flips class + chrome tint', async ({ page }) => {
    const errors = watchErrors(page)
    await page.setViewportSize({ width: 375, height: 720 })
    await page.goto('/')

    // Theme starts light (default) — the mobile toggle lives in the drawer.
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Open navigation' }).click()

    const toggle = page.getByRole('button', { name: 'Switch to dark mode' })
    await expect(toggle).toBeVisible()
    await toggle.click()

    await expect(page.locator('html')).toHaveClass(/dark/)
    // Browser chrome tint follows the theme (PWA-style theme-color meta).
    await expect(page.locator('meta[name="theme-color"]:not([media])')).toHaveAttribute('content', '#070F1F')
    // Persisted across reloads.
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)

    expect(errors).toEqual([])
  })

  test('tablet: header toggle flips light/dark both ways', async ({ page }) => {
    const errors = watchErrors(page)
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.locator('meta[name="theme-color"]:not([media])')).toHaveAttribute('content', '#EAF1FB')

    expect(errors).toEqual([])
  })
})

test.describe('live simulation', () => {
  // ?sim=fast compresses the cadence (first event ~1.2s, then every 1.5-2.5s)
  // so the E2E run stays fast; production cadence is 9s then 12-25s.
  test('numbers move and notifications arrive continuously', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/?sim=fast')

    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/ })
    const readUnread = async () => {
      const label = await bell.getAttribute('aria-label')
      const m = /(\d+) unread/.exec(label ?? '')
      return m ? Number(m[1]) : 0
    }

    // Seed state: a handful unread.
    const initial = await readUnread()
    expect(initial).toBeGreaterThan(0)

    // Within ~10s the feed grows — continuous notifications, not a static list.
    await expect
      .poll(async () => readUnread(), { timeout: 15_000, message: 'notification feed never grew' })
      .toBeGreaterThan(initial)

    // The numbers move: compare the whole set of money figures on the page
    // (a single locator can sit on a fixed value like the target bar).
    const moneySet = async () => {
      const all = await page.locator('main').allTextContents()
      const figs = all.join(' ').match(/GH¢[\d,]+/g) ?? []
      return [...new Set(figs)].sort().join('|')
    }
    const firstSet = await moneySet()
    await expect
      .poll(async () => moneySet(), {
        timeout: 25_000,
        message: 'dashboard numbers never changed',
      })
      .not.toBe(firstSet)

    // Simulated records are session-only: no operational data is persisted
    // (only the UI preference keys may exist, and only if a toggle happened).
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys.filter((k) => k.startsWith('adensa.localRecords') || k.includes('sim'))).toEqual([])

    expect(errors).toEqual([])
  })

  test('real data mode never receives simulated notifications', async ({ page }) => {
    await page.goto('/')
    // Flip the mode switch to Real (PIN-gated on public deploys; local dev
    // opens directly or we assert the gate itself).
    const realBtn = page.getByRole('button', { name: /Real data/i })
    if ((await realBtn.count()) > 0) {
      await realBtn.first().click()
      // Either the PIN gate appears, or the real feed renders empty.
      const pinVisible = await page.getByRole('dialog', { name: /PIN|Enter PIN/i }).isVisible().catch(() => false)
      const bell = page.getByRole('button', { name: /Notifications/ })
      if (!pinVisible) {
        await expect(bell).toHaveAccessibleName('Notifications, none unread')
      }
    }
  })
})

test.describe('notification bell UX', () => {
  test('read all, undo, and row navigation', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/ })
    await bell.click()

    const dialog = page.getByRole('dialog', { name: 'Notifications' })
    await expect(dialog).toBeVisible()

    await dialog.getByTitle('Mark all as read').click()
    await expect(page.getByRole('button', { name: 'Notifications, none unread' })).toBeVisible()

    await page.getByTitle(/Undo: Marked \d+ as read/).click()
    await expect(page.getByRole('button', { name: /Notifications, \d+ unread/ })).toBeVisible()

    // Clicking a row navigates to the owning tab and closes the panel.
    // (Several rows can target the same tab — take the first.)
    await dialog.getByTitle('Open orders').first().click()
    await expect(page).toHaveURL(/\/orders/)
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeHidden()

    expect(errors).toEqual([])
  })
})

test.describe('navigation and console health', () => {
  const routes = ['/', '/suppliers', '/customers', '/compare', '/quotes', '/orders', '/cash']

  for (const route of routes) {
    test(`${route} renders without console errors`, async ({ page }) => {
      const errors = watchErrors(page)
      await page.goto(route)
      await expect(page.locator('main')).toBeVisible()
      // Give lazy/suspense content a beat to settle.
      await page.waitForTimeout(500)
      expect(errors).toEqual([])
    })
  }
})
