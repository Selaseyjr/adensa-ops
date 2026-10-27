#!/usr/bin/env node
// Manage staff accounts from the command line (needs `npx wrangler login`).
// Day to day the Product Lead manages the team on the Team page; this tool
// creates the very first Product Lead and is the fallback for lockouts.
//
//   npm run staff -- add --email ama@adensa.com --name "Ama Mensah" --role product_lead
//   npm run staff -- reset --email ama@adensa.com      new temporary password
//   npm run staff -- list
//   add --local / reset --local / list --local         use the local D1 of `wrangler dev`
//
// Roles: product_lead, operations_manager, secretary. Passwords are typed
// hidden, hashed here (PBKDF2-SHA256, the same format the worker uses) and
// only the hash is sent to D1. New and reset accounts must choose a new
// password at their next sign-in.

import { spawnSync } from 'node:child_process'
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROLES = ['product_lead', 'operations_manager', 'secretary']
const ITERATIONS = 100_000
const MIN_LENGTH = 10
const STAFF_SCHEMA =
  'CREATE TABLE IF NOT EXISTS staff (' +
  'id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, ' +
  'password_hash TEXT NOT NULL, token_version INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, ' +
  'must_change_password INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'

const [command, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const local = rest.includes('--local')
const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}
const sql = (v) => `'${String(v).replace(/'/g, "''")}'`

function d1(args) {
  return spawnSync('npx', ['wrangler', 'd1', 'execute', 'adensa-ops', local ? '--local' : '--remote', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function runSql(statements) {
  const dir = mkdtempSync(join(tmpdir(), 'adensa-staff-'))
  const file = join(dir, 'staff.sql')
  writeFileSync(file, statements.join(';\n') + ';\n')
  try {
    const res = d1(['--file', file])
    if (res.status !== 0) fail('D1 command failed. Run `npx wrangler login` and try again.')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Hidden prompt that also works with pasted or piped input: keystrokes are
// buffered into lines, so several lines arriving in one chunk are kept.
const lines = []
const waiters = []
let current = ''
let lastWasCR = false
let listening = false

function pushLine(line) {
  const waiter = waiters.shift()
  if (waiter) waiter(line)
  else lines.push(line)
}

function feed(chunk) {
  for (const char of chunk) {
    if (char === '\u0003') process.exit(1)
    if (char === '\n' && lastWasCR) {
      lastWasCR = false
      continue
    }
    lastWasCR = char === '\r'
    if (char === '\r' || char === '\n' || char === '\u0004') {
      pushLine(current)
      current = ''
    } else if (char === '\u007f' || char === '\b') {
      current = current.slice(0, -1)
    } else {
      current += char
    }
  }
}

function askHidden(question) {
  if (!listening) {
    listening = true
    process.stdin.setRawMode?.(true)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', feed)
    process.stdin.resume()
  }
  process.stdout.write(question)
  return new Promise((resolve) => {
    const done = (line) => {
      process.stdout.write('\n')
      resolve(line)
    }
    if (lines.length > 0) done(lines.shift())
    else waiters.push(done)
  })
}

function stopInput() {
  if (!listening) return
  process.stdin.setRawMode?.(false)
  process.stdin.pause()
}

async function newPassword(label) {
  const pw = await askHidden(`${label} (min ${MIN_LENGTH} characters): `)
  if (pw.length < MIN_LENGTH) fail('Password too short. Nothing was changed.')
  if ((await askHidden('Confirm: ')) !== pw) fail('Passwords do not match. Nothing was changed.')
  stopInput()
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(pw, Buffer.from(salt, 'hex'), ITERATIONS, 32, 'sha256').toString('hex')
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`
}

const email = (flag('email') ?? '').trim().toLowerCase()
const stamp = new Date().toISOString()

if (command === 'add') {
  const name = (flag('name') ?? '').trim()
  const role = flag('role')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Give a valid --email.')
  if (!name) fail('Give a --name.')
  if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(', ')}`)
  const hash = await newPassword(`Temporary password for ${name}`)
  runSql([
    STAFF_SCHEMA,
    `INSERT INTO staff (id, email, name, role, password_hash, token_version, active, must_change_password, created_at, updated_at) VALUES (${[
      randomUUID(),
      email,
      name,
      role,
      hash,
    ]
      .map(sql)
      .join(', ')}, 1, 1, 1, ${sql(stamp)}, ${sql(stamp)})`,
  ])
  console.log(`\nAdded ${name} <${email}> as ${role}. They choose their own password at first sign-in.`)
} else if (command === 'reset') {
  if (!email) fail('Give the --email to reset.')
  const hash = await newPassword(`New temporary password for ${email}`)
  runSql([
    STAFF_SCHEMA,
    `UPDATE staff SET password_hash = ${sql(hash)}, must_change_password = 1, active = 1, token_version = token_version + 1, updated_at = ${sql(stamp)} WHERE email = ${sql(email)}`,
  ])
  console.log(`\nReset ${email}: signed out everywhere; a new password is required at next sign-in.`)
} else if (command === 'list') {
  const res = d1(['--json', '--command', 'SELECT email, name, role, active, must_change_password FROM staff ORDER BY created_at'])
  if (res.status !== 0) fail('D1 command failed (has anyone been added yet?).')
  const rows = JSON.parse(res.stdout)?.[0]?.results ?? []
  console.table(rows)
} else {
  fail('Usage: npm run staff -- add|reset|list [--email …] [--name …] [--role …] [--local]')
}
