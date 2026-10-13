// Real-mode access gate. The PIN check runs entirely in the browser against
// a PBKDF2 hash (see pin.secret.ts); unlocking is remembered per tab session
// (sessionStorage) so a refresh keeps working but a fresh visitor — or a new
// tab — always hits the gate. This is a privacy speed bump for the public
// deployment, not server-grade auth: the dataset still ships in the bundle.

import { PIN_HASH, PIN_ITERATIONS, PIN_SALT } from './pin.secret';

const UNLOCK_KEY = 'adensa.realUnlocked';

export function isRealUnlocked(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(UNLOCK_KEY) === '1';
}

export function unlockReal(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    /* private mode — unlock still applies to this tab via state */
  }
}

export function lockReal(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** PBKDF2-SHA256 verification — constant-work, no early exit. */
export async function verifyPin(pin: string): Promise<boolean> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return false;
  if (!pin) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pin),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: hexToBytes(PIN_SALT),
        iterations: PIN_ITERATIONS,
        hash: 'SHA-256',
      },
      key,
      256,
    );
    const derived = [...new Uint8Array(bits)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time-ish comparison.
    let diff = 0;
    for (let i = 0; i < PIN_HASH.length; i++) {
      diff |= PIN_HASH.charCodeAt(i) ^ derived.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}
