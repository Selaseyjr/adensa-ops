import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Edition: `VITE_EDITION=app` builds the real platform, anything else (or
// nothing) builds the public demo. The alias swaps in that edition's data
// module, so the other edition's code never reaches the bundle.
const edition = process.env.VITE_EDITION === 'app' ? 'app' : 'demo'
const editionModule = fileURLToPath(new URL(`./src/editions/${edition}.ts`, import.meta.url))

// Local API: `npx wrangler dev` serves the worker on :8787; run
// `API_PROXY=http://localhost:8787 npm run dev` to use it from the Vite app
// (same-origin /api, exactly like the Vercel rewrite in production).
const apiProxy = process.env.API_PROXY

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@edition': editionModule } },
  // Separate dependency caches so a demo and an app dev server can run side by side.
  cacheDir: `node_modules/.vite-${edition}`,
  define: { 'import.meta.env.VITE_EDITION': JSON.stringify(edition) },
  server: apiProxy ? { proxy: { '/api': { target: apiProxy, changeOrigin: true } } } : undefined,
  build: {
    rollupOptions: {
      output: {
        // Vendor split: heavy libraries land in their own long-lived chunks so
        // an app change doesn't re-download them, and the entry stays small.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // jspdf stays out of the eager vendor chunk: it loads only when a
          // user actually downloads an invoice or receipt (~120KB gzipped).
          if (id.includes('jspdf')) return undefined
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('leaflet')) return 'map'
          if (id.includes('react-router')) return 'router'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) {
            return 'react'
          }
          return 'vendor'
        },
      },
    },
  },
})
