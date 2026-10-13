// Cloudflare Worker for Adensa Ops (static SPA).
// Serves the Vite build output via the ASSETS binding; no API routes yet.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
