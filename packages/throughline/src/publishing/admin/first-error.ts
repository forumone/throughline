/*
Go to the first field that is wrong. forumone-2026#805.

A failed save, publish or schedule marks its fields red and leaves the editor to
find them — further down the page, on a tab they are not on, or inside a block
that is collapsed. This finds the first one in page order, opens whatever hides
it, scrolls it into view below the sticky header, and moves focus to it, which
also tells a screen-reader user where the problem is.

It reads the DOM Payload's admin renders, because that is where "invalid" and
"hidden" both live, and nothing in form state says which tab is open or which
row is collapsed. The classes it reads are Payload's own (`@payloadcms/ui` 3.x):

- `.field-type.error` — a field showing its error;
- `.tabs-field__tab-button--has-error` — a tab whose fields have errors, and
  `--active` on the one that is open (only its fields are rendered);
- `.collapsible--collapsed` — a block row, array row or collapsible that is
  closed, whose fields are rendered but not displayed; `.collapsible__toggle`
  opens it.

No JSX, so the decision is testable against a document built by hand.
*/

const FIELD_ERROR = '.field-type.error'
const TAB_ERROR = '.tabs-field__tab-button--has-error'
const TAB_ACTIVE = 'tabs-field__tab-button--active'
const TAB_HIDDEN = 'tabs-field__tab-button--hidden'
const COLLAPSED = 'collapsible--collapsed'

/** What to do next to reach the first error. */
export type FirstErrorStep =
  /** Open this tab: the first error is among its fields, which are not rendered yet. */
  | { kind: 'tab'; element: HTMLElement }
  /** Click this toggle: the first error is inside a collapsed row. Outermost first. */
  | { kind: 'expand'; element: HTMLElement }
  /** The field itself: scroll to it and focus it. */
  | { kind: 'field'; element: HTMLElement }

/**
 * The next step towards the first error under `root`, or `null` when nothing
 * is marked. Call it again after each step: opening a tab renders fields that
 * were not there to find.
 */
export function nextStep(root: ParentNode): FirstErrorStep | null {
  const candidates = root.querySelectorAll<HTMLElement>(`${FIELD_ERROR}, ${TAB_ERROR}`)
  for (const candidate of Array.from(candidates)) {
    if (candidate.matches(TAB_ERROR)) {
      if (candidate.classList.contains(TAB_ACTIVE) || candidate.classList.contains(TAB_HIDDEN)) {
        continue
      }
      /*
      The open tab's fields render after the whole tab bar, so an inactive tab
      with errors comes first in the document even when the open one has
      errors of its own. Those are the ones on screen: go to them first.
      */
      const bar = candidate.parentElement
      if (bar?.querySelector(`.${TAB_ACTIVE}${TAB_ERROR}`)) continue
      return { kind: 'tab', element: candidate }
    }

    const collapsed = collapsedAncestors(candidate)
    if (collapsed.length > 0) {
      const toggle = toggleOf(collapsed[0]!)
      if (toggle) return { kind: 'expand', element: toggle }
      continue
    }
    return { kind: 'field', element: candidate }
  }
  return null
}

/** Every collapsed container around `element`, outermost first. */
export function collapsedAncestors(element: Element): HTMLElement[] {
  const found: HTMLElement[] = []
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (at.classList.contains(COLLAPSED)) found.unshift(at)
  }
  return found
}

/** A collapsible's own toggle: its header comes before its content. */
function toggleOf(collapsible: HTMLElement): HTMLElement | null {
  return collapsible.querySelector<HTMLElement>('.collapsible__toggle')
}

/** The first thing inside a field that takes focus, if any. */
export function focusTarget(field: HTMLElement): HTMLElement | null {
  return field.querySelector<HTMLElement>(
    [
      'input:not([type="hidden"]):not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[contenteditable="true"]',
      'button:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', '),
  )
}

/**
 * How far below the top of the viewport a field must land to clear whatever
 * is stuck there — Payload's app header and the document's controls bar.
 */
export function stickyOffset(doc: Document = document): number {
  let bottom = 0
  const headers = doc.querySelectorAll<HTMLElement>(
    '.app-header, .doc-header, .doc-controls, [data-sticky-header]',
  )
  for (const element of Array.from(headers)) {
    const position = doc.defaultView?.getComputedStyle(element).position
    if (position !== 'sticky' && position !== 'fixed') continue
    const rect = element.getBoundingClientRect()
    if (rect.top <= 1) bottom = Math.max(bottom, rect.bottom)
  }
  return bottom
}

export interface GoToFirstErrorOptions {
  /** Where to look. Default: the whole document. */
  root?: ParentNode
  /** Steps to try before giving up. A tab and two nested rows is three. */
  maxSteps?: number
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 16)
  })

/** How long a collapsible takes to open: `AnimateHeight`'s default duration. */
const EXPAND_MS = 320

/**
 * Brings the first invalid field into view and focuses it. Resolves `true`
 * when it found one.
 *
 * Waits a frame before looking, and a little longer when nothing is marked
 * yet, because it is called straight after the errors are dispatched and the
 * form has not rendered them.
 */
export async function goToFirstError(options: GoToFirstErrorOptions = {}): Promise<boolean> {
  if (typeof document === 'undefined') return false
  const root = options.root ?? document
  const maxSteps = options.maxSteps ?? 8
  let empty = 0

  for (let step = 0; step < maxSteps; step++) {
    await nextFrame()
    const next = nextStep(root)
    if (!next) {
      // Not rendered yet, or nothing to find. Three tries, then the latter.
      if (++empty > 3) return false
      await wait(100)
      continue
    }
    if (next.kind === 'tab') {
      next.element.click()
      continue
    }
    if (next.kind === 'expand') {
      next.element.click()
      await wait(EXPAND_MS)
      continue
    }
    reveal(next.element)
    return true
  }
  return false
}

/** Scrolls `field` to just below the sticky header and focuses its input. */
export function reveal(field: HTMLElement): void {
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // `scroll-margin-top` is what `scrollIntoView` honours, in whichever element
  // scrolls. Put back afterwards so it never affects anything else.
  const previous = field.style.scrollMarginTop
  field.style.scrollMarginTop = `${Math.round(stickyOffset(field.ownerDocument) + 16)}px`
  field.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  setTimeout(() => {
    field.style.scrollMarginTop = previous
  }, 1000)

  const target = focusTarget(field)
  if (target) {
    target.focus({ preventScroll: true })
    return
  }
  // Nothing inside takes focus: the field itself does, so a screen reader
  // still lands on it.
  if (!field.hasAttribute('tabindex')) field.setAttribute('tabindex', '-1')
  field.focus({ preventScroll: true })
}

/*
A save, publish or schedule the editor asked for, as opposed to an autosave.

The provider arms this when one of Payload's save buttons is clicked, or the
save shortcut pressed, and goes to the first error only if an error toast
follows while it is armed. An autosave has no click, so the page never moves
while somebody is typing. A control that goes to the first error itself — the
Publish button — disarms it first, so the error is not gone to twice.
*/
let armedUntil = 0

/** How long after a click a failure still counts as that click's. */
export const ARMED_FOR_MS = 20_000

export function armFirstError(now = Date.now()): void {
  armedUntil = now + ARMED_FOR_MS
}

export function disarmFirstError(): void {
  armedUntil = 0
}

/** Whether a failure now belongs to an explicit save, consuming the arm if so. */
export function takeArmed(now = Date.now()): boolean {
  const armed = now <= armedUntil
  armedUntil = 0
  return armed
}

/** The save buttons Payload renders, by the ids it gives them. */
export const SAVE_BUTTON = '#action-save, #action-save-draft'

/** Whether `event` is the editor asking to save: a save button, or the shortcut. */
export function isExplicitSave(event: Event): boolean {
  if (event.type === 'click') {
    const target = event.target as Element | null
    return Boolean(target?.closest?.(SAVE_BUTTON))
  }
  if (event.type === 'keydown') {
    const key = event as KeyboardEvent
    return (key.metaKey || key.ctrlKey) && key.key.toLowerCase() === 's'
  }
  return false
}
