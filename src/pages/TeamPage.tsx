// Team (app edition, Product Lead only): staff accounts and their roles.
// Every change is applied by the worker, which re-checks the Product Lead's
// session; role changes, resets and deactivations sign that person out.

import { useEffect, useState } from 'react'
import { KeyRound, UserPlus } from 'lucide-react'
import { ROLES, ROLE_LABELS, type Role, type StaffUser } from '../lib/permissions'
import { createStaff, listStaff, updateStaff } from '../lib/staffAuth'
import { useToast } from '../components/toast'

const inputCls =
  'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-400'
const labelCls = 'block text-[11px] font-medium text-ink-soft'

const ROLE_SUMMARY: Record<Role, string> = {
  product_lead: 'Everything, including the team',
  operations_manager: 'All operations, money and cash',
  secretary: 'Customers, quotes, orders and deliveries',
}

/** A temporary password the new person replaces at first sign-in. */
function temporaryPassword(): string {
  const words = ['sun', 'rise', 'gold', 'bar', 'quote', 'cement', 'pipe', 'cable', 'build', 'accra']
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length]
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, '0')
  return `${pick()}-${pick()}-${pick()}-${digits}`
}

export function TeamPage({ me }: { me: StaffUser }) {
  const toast = useToast()
  const [staff, setStaff] = useState<StaffUser[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'secretary' as Role, password: temporaryPassword() })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const list = await listStaff()
    if (list) setStaff(list)
    else setLoadError(true)
  }

  useEffect(() => {
    void load()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    const r = await createStaff(form)
    setBusy(false)
    if (!r.ok) return setFormError(r.message)
    toast.success(`${r.user.name} added as ${ROLE_LABELS[r.user.role]}. Temporary password: ${form.password}`)
    setAdding(false)
    setForm({ name: '', email: '', role: 'secretary', password: temporaryPassword() })
    void load()
  }

  async function patch(user: StaffUser, change: Parameters<typeof updateStaff>[1], message: string) {
    const r = await updateStaff(user.id, change)
    if (!r.ok) return toast.info(r.message)
    toast.success(message)
    void load()
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Team</h2>
          <p className="mt-0.5 text-sm text-ink-faint">Staff accounts and what each position can access.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primary-hover"
          >
            <UserPlus size={15} aria-hidden="true" /> Add staff member
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className="rounded-xl border border-line bg-surface p-5" aria-label="Add staff member">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="team-name">
                Full name
              </label>
              <input id="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} mt-1.5`} />
            </div>
            <div>
              <label className={labelCls} htmlFor="team-email">
                Email
              </label>
              <input
                id="team-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="team-role">
                Position
              </label>
              <select
                id="team-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className={`${inputCls} mt-1.5`}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="team-password">
                Temporary password
              </label>
              <input
                id="team-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={`${inputCls} num mt-1.5`}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            {ROLE_SUMMARY[form.role]}. Share the temporary password in person; it is replaced at first sign-in.
          </p>
          {formError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {formError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !form.name || !form.email}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        {loadError ? (
          <p className="p-6 text-center text-sm text-ink-faint">The team list could not be loaded.</p>
        ) : !staff ? (
          <p className="p-6 text-center text-sm text-ink-faint">Loading…</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {staff.map((u) => {
                const self = u.id === me.id
                return (
                  <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {u.name}
                        {self && <span className="ml-1.5 text-xs font-normal text-ink-faint">(you)</span>}
                      </div>
                      <div className="text-xs text-ink-faint">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Position of ${u.name}`}
                        value={u.role}
                        onChange={(e) =>
                          void patch(u, { role: e.target.value as Role }, `${u.name} is now ${ROLE_LABELS[e.target.value as Role]}.`)
                        }
                        className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {!u.active ? (
                        <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-faint">Deactivated</span>
                      ) : u.mustChangePassword ? (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">Awaiting first sign-in</span>
                      ) : (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => {
                            const password = temporaryPassword()
                            void patch(u, { password }, `${u.name}'s new temporary password: ${password}`)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-subtle hover:text-ink"
                        >
                          <KeyRound size={13} aria-hidden="true" /> Reset password
                        </button>
                        {!self && (
                          <button
                            onClick={() =>
                              void patch(u, { active: !u.active }, `${u.name} ${u.active ? 'deactivated and signed out' : 'reactivated'}.`)
                            }
                            className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-subtle hover:text-ink"
                          >
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-sm font-semibold text-ink">{ROLE_LABELS[r]}</div>
            <div className="mt-0.5 text-xs text-ink-faint">{ROLE_SUMMARY[r]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
