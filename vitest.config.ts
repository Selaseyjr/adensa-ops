import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Separate from vite.config.ts on purpose: tests need jsdom + jest-dom and
// don't benefit from the Tailwind/rollup build plugins (faster startup, and
// vitest gives this file priority over vite.config.ts when it exists).
export default defineConfig({
  plugins: [react()],
  // Tests run the demo edition through the alias; app-edition modules are
  // imported directly by their own tests.
  resolve: { alias: { '@edition': fileURLToPath(new URL('./src/editions/demo.ts', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
