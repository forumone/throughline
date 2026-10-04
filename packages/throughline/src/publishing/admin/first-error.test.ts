// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armFirstError,
  collapsedAncestors,
  disarmFirstError,
  focusTarget,
  goToFirstError,
  isExplicitSave,
  nextStep,
  takeArmed,
} from './first-error.js'

/*
Markup in the shape `@payloadcms/ui` 3.x renders, cut down to the classes the
search reads. forumone-2026#805.
*/
const field = (name: string, error = false) =>
  `<div class="field-type text${error ? ' error' : ''}" id="field-${name}"><label>${name}</label><input name="${name}" /></div>`

const row = (inner: string, collapsed: boolean, id: string) => `
  <div class="collapsible${collapsed ? ' collapsible--collapsed' : ''}" id="${id}">
    <div class="collapsible__toggle-wrap"><button type="button" class="collapsible__toggle" id="${id}-toggle">Toggle</button></div>
    <div class="collapsible__content">${inner}</div>
  </div>`

const tabs = (buttons: Array<{ label: string; active?: boolean; error?: boolean }>, content: string) => `
  <div class="tabs-field">
    <div class="tabs-field__tabs">
      ${buttons
        .map(
          (b) =>
            `<button type="button" id="tab-${b.label}" class="tabs-field__tab-button${b.active ? ' tabs-field__tab-button--active' : ''}${b.error ? ' tabs-field__tab-button--has-error' : ''}">${b.label}</button>`,
        )
        .join('')}
    </div>
    <div class="tabs-field__content">${content}</div>
  </div>`

beforeEach(() => {
  document.body.innerHTML = ''
  disarmFirstError()
})

describe('nextStep', () => {
  it('is nothing when nothing is marked', () => {
    document.body.innerHTML = field('title') + field('slug')
    expect(nextStep(document)).toBeNull()
  })

  it('is the first marked field in page order', () => {
    document.body.innerHTML = field('title') + field('slug', true) + field('summary', true)
    expect(nextStep(document)).toEqual({ kind: 'field', element: document.getElementById('field-slug') })
  })

  it('opens a collapsed row first, outermost first', () => {
    document.body.innerHTML = field('title') + row(row(field('image', true), true, 'inner'), true, 'outer')
    expect(nextStep(document)).toEqual({
      kind: 'expand',
      element: document.getElementById('outer-toggle'),
    })
    expect(collapsedAncestors(document.getElementById('field-image')!).map((e) => e.id)).toEqual([
      'outer',
      'inner',
    ])
  })

  it('goes through an open row without stopping', () => {
    document.body.innerHTML = row(field('image', true), false, 'open')
    expect(nextStep(document)?.kind).toBe('field')
  })

  it('switches to a tab whose fields have errors, before anything after the tab bar', () => {
    document.body.innerHTML =
      tabs([{ label: 'Content', active: true }, { label: 'SEO', error: true }], field('heading')) +
      field('sidebar', true)
    expect(nextStep(document)).toEqual({ kind: 'tab', element: document.getElementById('tab-SEO') })
  })

  it('stays on the open tab when it has errors of its own: those are on screen', () => {
    document.body.innerHTML = tabs(
      [
        { label: 'Content', active: true, error: true },
        { label: 'SEO', error: true },
      ],
      field('heading', true),
    )
    expect(nextStep(document)).toEqual({
      kind: 'field',
      element: document.getElementById('field-heading'),
    })
  })
})

describe('focusTarget', () => {
  it('is the field’s own input, not its label', () => {
    document.body.innerHTML = field('title', true)
    expect(focusTarget(document.getElementById('field-title')!)?.tagName).toBe('INPUT')
  })

  it('skips a hidden input', () => {
    document.body.innerHTML =
      '<div class="field-type error" id="f"><input type="hidden" /><textarea></textarea></div>'
    expect(focusTarget(document.getElementById('f')!)?.tagName).toBe('TEXTAREA')
  })
})

describe('goToFirstError', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the tab, then the row, then scrolls to and focuses the field', async () => {
    document.body.innerHTML = tabs([{ label: 'Content', active: true }, { label: 'SEO', error: true }], '')
    // What Payload does on a tab click: makes it the open tab and renders its
    // fields, marked.
    document.getElementById('tab-SEO')!.addEventListener('click', () => {
      document.getElementById('tab-Content')!.classList.remove('tabs-field__tab-button--active')
      document.getElementById('tab-SEO')!.classList.add('tabs-field__tab-button--active')
      document.querySelector('.tabs-field__content')!.innerHTML = row(field('description', true), true, 'meta')
      document.getElementById('meta-toggle')!.addEventListener('click', () => {
        document.getElementById('meta')!.classList.remove('collapsible--collapsed')
      })
    })

    await expect(goToFirstError()).resolves.toBe(true)

    const target = document.getElementById('field-description')!
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    expect(document.activeElement).toBe(target.querySelector('input'))
  })

  it('jumps rather than scrolls smoothly under prefers-reduced-motion', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
    document.body.innerHTML = field('title', true)
    await goToFirstError()
    expect(document.getElementById('field-title')!.scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'auto',
    })
    window.matchMedia = undefined as never
  })

  it('resolves false when nothing is marked, after waiting for a render', async () => {
    document.body.innerHTML = field('title')
    await expect(goToFirstError()).resolves.toBe(false)
  })
})

describe('arming', () => {
  it('counts a failure only after an explicit save, and only once', () => {
    expect(takeArmed()).toBe(false)
    armFirstError(1_000)
    expect(takeArmed(1_500)).toBe(true)
    expect(takeArmed(1_600)).toBe(false)
  })

  it('lapses, so an autosave long after a click does not move the page', () => {
    armFirstError(0)
    expect(takeArmed(60_000)).toBe(false)
  })

  it('knows Payload’s save buttons and the save shortcut from anything else', () => {
    document.body.innerHTML =
      '<button id="action-save"><span id="label">Publish</span></button><button id="other">Other</button>'
    const click = (id: string) => {
      const event = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: document.getElementById(id) })
      return event
    }
    expect(isExplicitSave(click('label'))).toBe(true)
    expect(isExplicitSave(click('other'))).toBe(false)
    expect(isExplicitSave(new KeyboardEvent('keydown', { key: 's', metaKey: true }))).toBe(true)
    expect(isExplicitSave(new KeyboardEvent('keydown', { key: 's' }))).toBe(false)
  })
})
