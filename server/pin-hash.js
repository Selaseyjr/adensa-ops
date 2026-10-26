// Real-mode PIN, verified server-side by the worker (POST /api/session).
// Only the PBKDF2 hash is stored; the PIN itself never appears in source.
// This module is imported by worker.js only, never by the frontend bundle.
//
// Regenerate after changing the PIN:  npm run set-pin
// (see scripts/set-pin.mjs)

export const PIN_SALT = '5ab9c396fed0718e46ceedf5469c1d92'
export const PIN_ITERATIONS = 310_000
export const PIN_HASH =
  'b6e02be5024e601c0b28d77466e41c545e3361e01305a00ecc2d687535602f71'
