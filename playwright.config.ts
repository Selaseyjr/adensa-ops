import { defineConfig, devices } from '@playwright/test'

// E2E runs against the same Vite dev server the team uses (port 15100).
// Locally we reuse the already-running server; CI starts its own.
const PORT = 15100
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    // The sim writes nothing to storage, but each test starts clean.
    storageState: undefined,
    // CHROMIUM_PATH: run against a preinstalled browser when the pinned
    // Playwright build is not downloaded (sandboxes, offline machines).
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet',
      // iPad geometry (768x1024, DPR 2) but on Chromium: this suite tests
      // layout/viewport behaviour, not engine differences, and keeps CI to
      // one browser download.
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
