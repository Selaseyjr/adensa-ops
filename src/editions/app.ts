// App edition: the real platform. Real data comes from the API with the
// signed session token; there is no demo seed and no simulation in this
// bundle, and the bell never shows simulated events.

import { useEffect, useMemo, useState } from 'react'
import type { Dataset } from '../lib/dataSource'
import { mergeDataset } from '../lib/localData'
import { fetchRealDataset, isRealUnlocked, lockReal } from '../lib/realAccess'
import { SignInScreen } from '../components/SignIn'
import { createPushQueue, hydrateRecords } from '../lib/remote'
import type { DataStatus, Edition } from './types'

function emptyDataset(): Dataset {
  const d = new Date()
  return {
    suppliers: [],
    products: [],
    prices: [],
    customers: [],
    orders: [],
    inquiries: [],
    quotes: [],
    cash: [],
    meta: {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      revenueTargetGhs: 0,
      openingCashGhs: 0,
    },
  }
}

const NO_NOTIFICATIONS: never[] = []

const edition: Edition = {
  name: 'app',
  mode: 'real',
  SignIn: SignInScreen,
  isSignedIn: isRealUnlocked,
  signOut: lockReal,
  showcase: false,
  useEditionData(local) {
    const [seed, setSeed] = useState<Dataset | null>(null)
    const [status, setStatus] = useState<DataStatus>('loading')
    useEffect(() => {
      let cancelled = false
      void fetchRealDataset().then((dataset) => {
        if (cancelled) return
        setSeed(dataset)
        setStatus(dataset ? 'ready' : 'error')
      })
      return () => {
        cancelled = true
      }
    }, [])
    const dataset = useMemo(() => mergeDataset(seed ?? emptyDataset(), local), [seed, local])
    return { dataset, status, notifications: NO_NOTIFICATIONS }
  },
  hydrate(local, apply) {
    void hydrateRecords('real', local, apply)
  },
  createPush: () => createPushQueue('real'),
}

export default edition
