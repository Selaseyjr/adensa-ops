import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Vendor split: heavy libraries land in their own long-lived chunks so
        // an app change doesn't re-download them, and the entry stays small.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
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
