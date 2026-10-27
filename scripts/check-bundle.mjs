#!/usr/bin/env node
// Fails the build if a bundle contains what its edition must never ship:
//  - every edition: private real data (the real dataset lives in D1, loaded
//    from the git-ignored private/ folder; when that local file exists, every
//    real supplier and customer name is checked against the bundle),
//  - app edition: the synthetic demo seed and the simulation,
//  - demo edition: any call to the real-data API (session, real dataset).
//
// Runs after `vite build` (see the "build" script in package.json) with the
// same VITE_EDITION the build used.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const privateFile = new URL('../private/real-dataset.js', import.meta.url)
const realDataset = existsSync(privateFile) ? (await import(privateFile.href)).default : null

const dist = new URL('../dist/', import.meta.url).pathname

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

// Names that also occur in the public demo seed (a brand, a common name) are
// not evidence of a leak, so they are excluded.
const demoSource = readFileSync(new URL('../src/data/demo.ts', import.meta.url), 'utf8')

// Distinctive strings: every real supplier and customer name (when the
// private file is on this machine), plus the old repository paths.
const markers = [
  ...(realDataset?.suppliers ?? []).map((s) => s.name),
  ...(realDataset?.customers ?? []).map((c) => c.name),
  'server/real-dataset',
  'server/pin-hash',
].filter((m) => typeof m === 'string' && m.length >= 8 && !demoSource.includes(m))

const edition = process.env.VITE_EDITION === 'app' ? 'app' : 'demo'

/** `name: '...'` values inside one top-level array of the demo seed (read as text, no TS loader needed). */
function demoNames(section, nextSection) {
  const start = demoSource.indexOf(`  ${section}: [`)
  const end = demoSource.indexOf(`  ${nextSection}: [`, start)
  return [...demoSource.slice(start, end).matchAll(/\bname: '([^']+)'/g)].map((m) => m[1])
}

// Edition-specific forbidden strings.
const forbidden =
  edition === 'app'
    ? [
        // Demo seed: synthetic supplier and customer names.
        ...demoNames('suppliers', 'products'),
        ...demoNames('customers', 'orders'),
        // Simulation notifications.
        'Supplier price updated',
      ]
    : ['/api/session', '/api/real-dataset']

const texts = files(dist)
  .filter((f) => /\.(js|html|css|json|map)$/.test(f))
  .map((f) => [f.replace(dist, 'dist/'), readFileSync(f, 'utf8')])

function scan(list, label) {
  const hits = []
  for (const [file, text] of texts) for (const m of list) if (text.includes(m)) hits.push(`${m} -> ${file}`)
  if (hits.length > 0) {
    console.error(`${label} found in the ${edition} bundle:`)
    for (const h of hits.slice(0, 20)) console.error(`  ${h}`)
  }
  return hits.length
}

const failures =
  scan(markers, 'Private real data') +
  scan(forbidden, edition === 'app' ? 'Demo data or simulation' : 'Real-data API access')

if (failures > 0) process.exit(1)
console.log(
  `Bundle check (${edition} edition): no private data (${markers.length} markers${realDataset ? '' : ', private/ file not present'}), no ${
    edition === 'app' ? 'demo data' : 'real-data API calls'
  } (${forbidden.length} markers).`,
)
