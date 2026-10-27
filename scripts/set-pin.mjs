#!/usr/bin/env node
// Set the app-edition sign-in PIN.
// Usage:
//   npm run set-pin              prompts (hidden), then stores the PBKDF2-SHA256
//                                hash as worker secrets with `wrangler secret put`
//   npm run set-pin -- --local   writes them to .dev.vars for `wrangler dev`
//
// Secrets set: REAL_PIN_HASH, REAL_PIN_SALT, REAL_PIN_ITERATIONS and a fresh
// SESSION_SECRET (so every existing session is signed out). The PIN itself is
// never written anywhere, and nothing is written into the repository.
//
// NOTE: the salt is passed to pbkdf2Sync as DECODED BYTES (Buffer.from hex),
// not as the hex string — Web Crypto in the browser decodes it the same way,
// and the two must agree or the PIN will never verify.

import { createInterface } from 'node:readline';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const local = process.argv.includes('--local');

const ITERATIONS = 310_000;

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Hide input while typing the PIN.
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    process.stdout.write(question);
    let value = '';
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const pin = (await askHidden('New PIN (min 8 chars): ')).trim();
if (pin.length < 8) {
  console.error('PIN must be at least 8 characters. Aborting.');
  process.exit(1);
}
const confirm = (await askHidden('Confirm PIN: ')).trim();
if (confirm !== pin) {
  console.error('PINs do not match. Aborting.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(pin, salt, ITERATIONS, 32, 'sha256').toString('hex');

const secrets = {
  REAL_PIN_HASH: hash,
  REAL_PIN_SALT: salt.toString('hex'),
  REAL_PIN_ITERATIONS: String(ITERATIONS),
  SESSION_SECRET: randomBytes(32).toString('hex'),
};

if (local) {
  // .dev.vars is git-ignored; keep any other variables already in it.
  const keep = existsSync('.dev.vars')
    ? readFileSync('.dev.vars', 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !Object.keys(secrets).some((k) => l.startsWith(`${k}=`)))
    : [];
  writeFileSync('.dev.vars', [...keep, ...Object.entries(secrets).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n');
  console.log('\nWrote the PIN secrets to .dev.vars (local `wrangler dev` only).');
} else {
  for (const [name, value] of Object.entries(secrets)) {
    const res = spawnSync('npx', ['wrangler', 'secret', 'put', name], { input: `${value}\n`, stdio: ['pipe', 'inherit', 'inherit'] });
    if (res.status !== 0) {
      console.error(`\nCould not set ${name}. Run \`npx wrangler login\` first, then try again.`);
      process.exit(res.status ?? 1);
    }
  }
  console.log('\nPIN secrets set on the worker. The new PIN is live; existing sessions are signed out.');
}
rl.close();
