import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { changePassword, signIn, signOut } from '../lib/staffAuth'
import { AdensaLogo } from './brand'

/** Public demo, linked from the sign-in screen for visitors without an account. */
export const DEMO_URL = 'https://demo.adensaops.com'

const inputCls =
  'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-400'
const labelCls = 'block text-[11px] font-medium text-ink-soft'

function Shell({ title, sub, children, footer }: { title: string; sub: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <AdensaLogo className="h-10" />
        </div>
        <section className="mt-8 rounded-xl border border-line bg-surface p-6">
          <h1 className="text-base font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-xs text-ink-faint">{sub}</p>
          {children}
        </section>
        {footer && <p className="mt-6 text-center text-xs text-ink-faint">{footer}</p>}
      </div>
    </main>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  autoFocus?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative mt-1.5">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

/** App edition entry point: each staff member signs in with their own account. */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (checking || !email || !password) return
    setChecking(true)
    setError('')
    const result = await signIn(email, password)
    setChecking(false)
    if (result.ok) onSignedIn()
    else setError(result.message)
  }

  return (
    <Shell
      title="Sign in to AdensaOps"
      sub="Adensa Supply & Logistics Ltd. · staff access"
      footer={
        <>
          <a href={DEMO_URL} className="font-medium text-ink-soft transition hover:text-ink hover:underline">
            View the public demo
          </a>
          {' · '}Your project. Our procurement.
        </>
      }
    >
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="signin-email" className={labelCls}>
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            className={`${inputCls} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="signin-password" className={labelCls}>
            Password
          </label>
          <PasswordInput id="signin-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking || !email || !password}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
        >
          {checking ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-[11px] text-ink-faint">Forgotten password: the Product Lead can reset it.</p>
      </form>
    </Shell>
  )
}

/** Password change form, used at first sign-in (forced) and from the account menu. */
export function ChangePasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < 10) return setError('Use at least 10 characters.')
    if (next !== confirm) return setError('The new passwords do not match.')
    setBusy(true)
    setError('')
    const r = await changePassword(current, next)
    setBusy(false)
    if (r.ok) onDone()
    else setError(r.message)
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div>
        <label htmlFor="pw-current" className={labelCls}>
          Current password
        </label>
        <PasswordInput id="pw-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      </div>
      <div>
        <label htmlFor="pw-next" className={labelCls}>
          New password
        </label>
        <PasswordInput id="pw-next" value={next} onChange={setNext} autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="pw-confirm" className={labelCls}>
          Confirm new password
        </label>
        <PasswordInput id="pw-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-subtle"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  )
}

/** First sign-in with a temporary password: choose your own before anything else. */
export function FirstPasswordScreen({ name, onDone }: { name: string; onDone: () => void }) {
  return (
    <Shell
      title={`Welcome, ${name.split(' ')[0]}`}
      sub="Choose your own password to finish setting up your account."
      footer={
        <button
          type="button"
          onClick={() => {
            signOut()
            window.location.assign('/')
          }}
          className="font-medium text-ink-soft transition hover:text-ink hover:underline"
        >
          Sign out
        </button>
      }
    >
      <ChangePasswordForm onDone={onDone} />
    </Shell>
  )
}
