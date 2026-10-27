#!/usr/bin/env node
// Load the real dataset into D1 (table `datasets`, row "real"), where the
// worker serves it from GET /api/real-dataset to signed-in staff.
//
// Usage:
//   npm run seed:real                         # private/real-dataset.js -> remote D1
//   npm run seed:real -- path/to/file.json    # any .js (default export) or .json
//   npm run seed:real -- --local              # local D1 used by `wrangler dev`
//
// The source file stays on your machine (private/ is git-ignored). Run this
// again whenever the seed changes; operator records are untouched.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const local = args.includes('--local')
const file = resolve(args.find((a) => !a.startsWith('--')) ?? 'private/real-dataset.js')

let dataset
try {
  dataset =
    extname(file) === '.json'
      ? JSON.parse(readFileSync(file, 'utf8'))
      : (await import(pathToFileURL(file).href)).default
} catch (err) {
  console.error(`Could not read ${file}: ${err.message}`)
  process.exit(1)
}

const ARRAYS = ['suppliers', 'products', 'prices', 'customers', 'orders', 'inquiries', 'quotes', 'cash']
const problems = ARRAYS.filter((k) => !Array.isArray(dataset?.[k])).map((k) => `${k} must be an array`)
if (!dataset?.meta || typeof dataset.meta.month !== 'string') problems.push('meta.month is required')
if (problems.length > 0) {
  console.error(`Not a valid dataset:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

const payload = JSON.stringify(dataset).replace(/'/g, "''")
const sql =
  'CREATE TABLE IF NOT EXISTS datasets (name TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);\n' +
  `INSERT INTO datasets (name, payload, updated_at) VALUES ('real', '${payload}', '${new Date().toISOString()}') ` +
  'ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;\n'

const dir = mkdtempSync(join(tmpdir(), 'adensa-seed-'))
const sqlFile = join(dir, 'seed.sql')
writeFileSync(sqlFile, sql)
try {
  const res = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'adensa-ops', local ? '--local' : '--remote', '--file', sqlFile],
    { stdio: 'inherit' },
  )
  if (res.status !== 0) process.exit(res.status ?? 1)
  console.log(
    `\nLoaded ${dataset.suppliers.length} suppliers, ${dataset.customers.length} customers and ${dataset.prices.length} prices into ${local ? 'local' : 'remote'} D1.`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
