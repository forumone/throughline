'use client'

import { type ReactNode, useEffect } from 'react'
import { armFirstError, goToFirstError, isExplicitSave, takeArmed } from './first-error.js'

/**
 * After a Save, Publish or Schedule that fails, takes the editor to the first
 * field that is wrong. forumone-2026#805.
 *
 * Registered by the publishing plugin in `admin.components.providers`, so it
 * wraps the whole admin. That is outside any form, which is why it listens to
 * the page rather than to form state:
 *
 * - **Arms** on a click on one of Payload's save buttons (`#action-save`,
 *   `#action-save-draft`) or the save shortcut. An autosave has neither, so the
 *   page never moves while somebody is typing.
 * - **Fires** when an error toast appears while armed — Payload raises one for
 *   every failed save, whether its own validation or the server refused — and
 *   goes to the first marked field, opening its tab or row if it must.
 * - **Disarms** on a success toast, or after twenty seconds.
 *
 * The Publish button and the Schedule control call `goToFirstError` themselves
 * once they have marked the fields, and disarm this first.
 */
export function FirstErrorProvider({ children }: { children?: ReactNode }): ReactNode {
  useEffect(() => {
    if (typeof document === 'undefined') return

    let observer: MutationObserver | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      observer?.disconnect()
      observer = null
      if (timer) clearTimeout(timer)
      timer = undefined
    }

    const watch = () => {
      stop()
      armFirstError()
      observer = new MutationObserver((mutations) => {
        const type = toastType(mutations)
        if (type === 'success') {
          takeArmed()
          stop()
        } else if (type === 'error') {
          stop()
          if (takeArmed()) void goToFirstError()
        }
      })
      // Only while armed: a whole-document observer during ordinary typing
      // would cost something for nothing.
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-type'],
      })
      timer = setTimeout(() => {
        takeArmed()
        stop()
      }, 20_000)
    }

    const onEvent = (event: Event) => {
      if (isExplicitSave(event)) watch()
    }

    document.addEventListener('click', onEvent, true)
    document.addEventListener('keydown', onEvent, true)
    return () => {
      document.removeEventListener('click', onEvent, true)
      document.removeEventListener('keydown', onEvent, true)
      stop()
    }
  }, [])

  return children
}

/**
 * The kind of toast these mutations show appearing, if any. Sonner marks each
 * toast `data-sonner-toast` with its `data-type`, and turns a promise toast
 * from `loading` to `error` in place, which is an attribute change rather than
 * a new node.
 */
function toastType(mutations: MutationRecord[]): 'error' | 'success' | undefined {
  for (const mutation of mutations) {
    const nodes =
      mutation.type === 'attributes' ? [mutation.target] : Array.from(mutation.addedNodes)
    for (const node of nodes) {
      if (!(node instanceof Element)) continue
      const toast = node.matches('[data-sonner-toast]')
        ? node
        : node.querySelector('[data-sonner-toast]')
      const type = toast?.getAttribute('data-type')
      if (type === 'error' || type === 'success') return type
    }
  }
  return undefined
}
