// Component tests for the NotificationsBell: badge counts, panel interactions
// (read all / undo / per-item toggle), empty state, keyboard + outside-click
// dismissal, and navigation to the owning tab.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsBell } from './NotificationsBell'
import { useNotifications, type AppNotification } from '../lib/notifications'

const items: AppNotification[] = [
  { id: 'a', kind: 'order', title: 'Order received', message: 'ORD-0241 placed', minutesAgo: 42, target: 'orders' },
  { id: 'b', kind: 'payment', title: 'Payment received', message: 'GH¢5,000 deposit', minutesAgo: 6, target: 'cash' },
  { id: 'c', kind: 'price', title: 'Supplier price updated', message: 'Cement up 3%', minutesAgo: 120, target: 'compare' },
  { id: 'd', kind: 'quote', title: 'Quotation sent', message: 'QT-018 sent', minutesAgo: 240, target: 'quotes', initiallyRead: true },
]

/** Host owns open state + read bookkeeping, exactly like App does. */
function Harness({ onNavigate, list = items }: { onNavigate: (t: string) => void; list?: AppNotification[] }) {
  const [open, setOpen] = useState(false)
  const state = useNotifications(list, 'demo')
  return (
    <NotificationsBell items={list} state={state} onNavigate={onNavigate} open={open} setOpen={setOpen} />
  )
}

describe('NotificationsBell', () => {
  it('shows the unread count in the accessible label and badge', () => {
    render(<Harness onNavigate={() => {}} />)
    const bell = screen.getByRole('button', { name: /Notifications, \d+ unread/ })
    expect(bell).toHaveAccessibleName('Notifications, 3 unread')
    expect(within(bell).getByText('3')).toBeInTheDocument()
  })

  it('opens the panel as a labelled dialog listing every item', async () => {
    const user = userEvent.setup()
    render(<Harness onNavigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Notifications, 3 unread/ }))
    const dialog = screen.getByRole('dialog', { name: 'Notifications' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(items.length)
    expect(within(dialog).getByText('Order received')).toBeInTheDocument()
  })

  it('marks everything read, then undoes it in one step', async () => {
    const user = userEvent.setup()
    render(<Harness onNavigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Notifications, 3 unread/ }))
    await user.click(screen.getByTitle('Mark all as read'))
    expect(screen.getByRole('button', { name: 'Notifications, none unread' })).toBeInTheDocument()

    await user.click(screen.getByTitle(/Undo: Marked 3 as read/))
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument()
  })

  it('toggling a single unread row marks it read', async () => {
    const user = userEvent.setup()
    render(<Harness onNavigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Notifications, 3 unread/ }))
    const dialog = screen.getByRole('dialog', { name: 'Notifications' })
    await user.click(within(dialog).getByTitle('Open orders'))
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('clicking a row navigates to the owning tab and closes the panel', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Harness onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: /Notifications, 3 unread/ }))
    await user.click(screen.getByTitle('Open cash'))
    expect(onNavigate).toHaveBeenCalledWith('cash')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape closes the panel and returns focus to the bell', async () => {
    const user = userEvent.setup()
    render(<Harness onNavigate={() => {}} />)
    const bell = screen.getByRole('button', { name: /Notifications, 3 unread/ })
    await user.click(bell)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(bell).toHaveFocus()
  })

  it('an outside click closes the panel', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Harness onNavigate={() => {}} />
        <button>outside</button>
      </>,
    )
    await user.click(screen.getByRole('button', { name: /Notifications, 3 unread/ }))
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the empty state when the feed is empty (real mode)', async () => {
    const user = userEvent.setup()
    render(<Harness onNavigate={() => {}} list={[]} />)
    await user.click(screen.getByRole('button', { name: 'Notifications, none unread' }))
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByTitle('Mark all as read')).not.toBeInTheDocument()
  })
})
