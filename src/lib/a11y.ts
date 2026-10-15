// Focus management for dialogs and popovers.
//
// useFocusTrap(containerRef, active):
//  - moves focus into the container when it opens (first focusable, or the
//    container itself),
//  - keeps Tab / Shift+Tab cycling inside the container,
//  - restores focus to whatever was focused before on close,
//  - lets Escape call onClose when provided.
//
// Used by the PIN modal, the KPI detail modal and the command palette.

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose?: () => void,
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Enter the dialog: focus its first focusable element.
    const first = focusables(container)[0]
    ;(first ?? container).focus({ preventScroll: true })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables(container!)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const current = document.activeElement
      if (e.shiftKey && (current === firstItem || !container!.contains(current))) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && (current === lastItem || !container!.contains(current))) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Return focus to where the user came from.
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [active, containerRef, onClose])
}
