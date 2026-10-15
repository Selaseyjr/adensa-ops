// Unit tests for the notification feed: time phrasing and the read/unread
// bookkeeping hook (undo, feed-key invalidation, counts).

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatWhen, useNotifications, type AppNotification } from './notifications'

const items: AppNotification[] = [
  { id: 'a', kind: 'order', title: 'Order received', message: 'm', minutesAgo: 0, target: 'orders' },
  { id: 'b', kind: 'payment', title: 'Payment', message: 'm', minutesAgo: 30, target: 'cash' },
  { id: 'c', kind: 'price', title: 'Price', message: 'm', minutesAgo: 180, target: 'compare' },
  { id: 'd', kind: 'quote', title: 'Quote', message: 'm', minutesAgo: 1500, target: 'quotes' },
  {
    id: 'e',
    kind: 'supplier',
    title: 'Supplier',
    message: 'm',
    minutesAgo: 60 * 30,
    target: 'suppliers',
    initiallyRead: true,
  },
]

describe('formatWhen', () => {
  it('uses inbox-standard phrasing across ranges', () => {
    expect(formatWhen(0.5)).toBe('Just now')
    expect(formatWhen(12)).toBe('12m ago')
    expect(formatWhen(3 * 60)).toBe('3h ago')
    expect(formatWhen(30 * 60)).toBe('Yesterday')
    expect(formatWhen(5 * 24 * 60)).toMatch(/^[A-Za-z]{3},? \d{1,2} [A-Za-z]{3}$/)
  })
})

describe('useNotifications', () => {
  it('seeds from initiallyRead and counts the rest as unread', () => {
    const { result } = renderHook(() => useNotifications(items, 'demo'))
    expect(result.current.unreadCount).toBe(4)
    expect(result.current.isRead('e')).toBe(true)
    expect(result.current.isRead('a')).toBe(false)
    expect(result.current.undoLabel).toBeNull()
  })

  it('marks one item and records an undo step', () => {
    const { result } = renderHook(() => useNotifications(items, 'demo'))
    act(() => result.current.markOne('a', true))
    expect(result.current.unreadCount).toBe(3)
    expect(result.current.undoLabel).toBe('Marked as read')
    act(() => result.current.undo())
    expect(result.current.unreadCount).toBe(4)
    expect(result.current.undoLabel).toBeNull()
  })

  it('is a no-op when the read state does not change (no phantom undo)', () => {
    const { result } = renderHook(() => useNotifications(items, 'demo'))
    act(() => result.current.markOne('e', true)) // already read
    expect(result.current.undoLabel).toBeNull()
  })

  it('marks all read and undo restores every flag at once', () => {
    const { result } = renderHook(() => useNotifications(items, 'demo'))
    act(() => result.current.markAllRead())
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.undoLabel).toBe('Marked 4 as read')
    act(() => result.current.undo())
    expect(result.current.unreadCount).toBe(4)
  })

  it('does not clear a pending undo when live sim items arrive (items identity changes, feedKey does not)', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: AppNotification[] }) => useNotifications(list, 'demo'),
      { initialProps: { list: items } },
    )
    act(() => result.current.markOne('a', true))
    expect(result.current.undoLabel).toBe('Marked as read')
    const live: AppNotification = {
      id: 'sim-1',
      kind: 'inquiry',
      title: 'New customer inquiry',
      message: 'm',
      minutesAgo: 0,
      target: 'customers',
      createdAt: Date.now(),
    } as AppNotification
    rerender({ list: [live, ...items] })
    expect(result.current.undoLabel).toBe('Marked as read')
  })

  it('clears the pending undo when the feed itself changes (Demo <-> Real)', () => {
    const { result, rerender } = renderHook(
      ({ list, key }: { list: AppNotification[]; key: string }) => useNotifications(list, key),
      { initialProps: { list: items, key: 'demo' } },
    )
    act(() => result.current.markOne('a', true))
    expect(result.current.undoLabel).toBe('Marked as read')
    rerender({ list: [], key: 'real' })
    expect(result.current.undoLabel).toBeNull()
    expect(result.current.unreadCount).toBe(0)
  })
})
