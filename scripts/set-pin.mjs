#!/usr/bin/env node
// Regenerate the Real-mode PIN hash.
// Usage:  npm run set-pin            (prompts, hides input)
// Writes src/lib/pin.secret.ts with a fresh salt + PBKDF2-SHA256 hash.
// The PIN itself is never written to disk — only its hash.
//
// NOTE: the salt is passed to pbkdf2Sync as DECODED BYTES (Buffer.from hex),
// not as the hex string — Web Crypto in the browser decodes it the same way,
// and the two must agree or the PIN will never verify.

import { createInterface } from 'node:readline';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'pin.secret.ts');
writeFileSync(
  file,
  `// PIN gate for Real data mode — public build ships with the real dataset in
// the bundle, so the toggle demands this PIN first. Only the PBKDF2 hash is
// stored; the PIN itself never appears in source or the deployed JavaScript.
//
// Regenerate after changing the PIN:  npm run set-pin
// (see scripts/set-pin.mjs)

export const PIN_SALT = '${salt.toString('hex')}';
export const PIN_ITERATIONS = ${ITERATIONS.toLocaleString('en-US').replace(/,/g, '_')};
export const PIN_HASH =
  '${hash}';
`,
);

console.log(`\nWrote ${file}`);
console.log('Commit and push to make the new PIN live on the deployment.');
