// Demo edition: synthetic seed + live simulation, entirely in the browser.
// It never imports the API client or the real-access module, so the public
// demo cannot reach real records even by mistake.

import { useMemo } from 'react'
import { demo } from '../data/demo'
import { demoNotifications } from '../data/demoNotifications'
import { mergeSim, useSimulation } from '../lib/simulation'
import type { StaffUser } from '../lib/permissions'
import type { Edition } from './types'

/** The demo has no accounts: visitors see everything a Product Lead sees, minus the team. */
const DEMO_VISITOR: StaffUser = {
  id: 'demo',
  email: 'demo@adensaops.com',
  name: 'Demo visitor',
  role: 'product_lead',
  active: true,
  mustChangePassword: false,
}

const edition: Edition = {
  name: 'demo',
  mode: 'demo',
  SignIn: null,
  FirstPassword: null,
  ChangePassword: null,
  TeamPage: null,
  currentUser: () => DEMO_VISITOR,
  refreshUser: async () => DEMO_VISITOR,
  signOut() {},
  showcase: true,
  useEditionData(local) {
    const { layer, notifications } = useSimulation(true, (sim) => mergeSim(demo, local, sim))
    const dataset = useMemo(() => mergeSim(demo, local, layer), [local, layer])
    const items = useMemo(() => {
      if (notifications.length === 0) return demoNotifications
      const now = Date.now()
      const live = notifications.map((n) => ({ ...n, minutesAgo: Math.max(0, (now - n.createdAt) / 60_000) }))
      return [...live, ...demoNotifications]
    }, [notifications])
    return { dataset, status: 'ready', notifications: items }
  },
  // The public demo keeps operator edits in this browser only.
  hydrate() {},
  createPush: () => () => {},
}

export default edition
