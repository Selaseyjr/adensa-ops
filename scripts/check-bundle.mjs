#!/usr/bin/env node
// Fails the build if private Real-mode data ever lands in the frontend
// bundle. The real dataset and PIN hash live in server/ and are served by the
// worker only; this guards against an accidental import from src/.
//
// Runs after `vite build` (see the "build" script in package.json).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import realDataset from '../server/real-dataset.js'
import { PIN_HASH, PIN_SALT } from '../server/pin-hash.js'

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

// Distinctive strings: every real supplier and customer name, plus the hash.
const markers = [
  ...realDataset.suppliers.map((s) => s.name),
  ...realDataset.customers.map((c) => c.name),
  PIN_HASH,
  PIN_SALT,
].filter((m) => typeof m === 'string' && m.length >= 8 && !demoSource.includes(m))

const leaks = []
for (const file of files(dist).filter((f) => /\.(js|html|css|json|map)$/.test(f))) {
  const text = readFileSync(file, 'utf8')
  for (const m of markers) if (text.includes(m)) leaks.push(`${m} -> ${file.replace(dist, 'dist/')}`)
}

if (leaks.length > 0) {
  console.error('Private Real-mode data found in the frontend bundle:')
  for (const l of leaks.slice(0, 20)) console.error(`  ${l}`)
  process.exit(1)
}
console.log(`Bundle check: no private data in dist/ (${markers.length} markers).`)
