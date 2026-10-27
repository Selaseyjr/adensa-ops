import { useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { unlockReal } from '../lib/realAccess'
import { AdensaLogo } from './brand'

/** Public demo, linked from the sign-in screen for visitors without access. */
export const DEMO_URL = 'https://demo.adensaops.com'

/**
 * App edition entry point. The PIN is checked by the worker
 * (POST /api/session); only the signed session token is kept in the tab.
 * Replaced by staff accounts once Cloudflare Access is in front of the app.
 */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [pin, setPin] = useState('')
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (checking || pin.length === 0) return
    setChecking(true)
    setError('')
    const result = await unlockReal(pin)
    setChecking(false)
    if (result === 'ok') {
      onSignedIn()
      return
    }
    setError(
      result === 'locked'
        ? 'Too many attempts. Try again in a minute.'
        : result === 'unavailable'
          ? 'The server is unreachable. Try again shortly.'
          : 'Incorrect PIN.',
    )
    inputRef.current?.select()
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <AdensaLogo className="h-10" />
        </div>
        <section className="mt-8 rounded-xl border border-line bg-surface p-6">
          <h1 className="text-base font-semibold text-ink">Sign in to AdensaOps</h1>
          <p className="mt-1 text-xs text-ink-faint">Adensa Supply &amp; Logistics Ltd. · staff access</p>
          <form onSubmit={submit} className="mt-5">
            <label htmlFor="signin-pin" className="block text-[11px] font-medium text-ink-soft">
              Access PIN
            </label>
            <div className="relative mt-1.5">
              <input
                id="signin-pin"
                ref={inputRef}
                type={visible ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="current-password"
                autoFocus
                className={`w-full rounded-lg border bg-canvas px-3 py-2.5 pr-10 text-sm text-ink focus:outline-none focus:ring-2 ${
                  error ? 'border-danger/40 focus:ring-danger/40' : 'border-line-strong focus:ring-brand-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Hide PIN' : 'Show PIN'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={checking || pin.length === 0}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Sign in'}
            </button>
          </form>
        </section>
        <p className="mt-6 text-center text-xs text-ink-faint">
          <a href={DEMO_URL} className="font-medium text-ink-soft transition hover:text-ink hover:underline">
            View the public demo
          </a>
          {' · '}Your project. Our procurement.
        </p>
      </div>
    </main>
  )
}
