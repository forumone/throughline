// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FirstErrorProvider } from './FirstErrorProvider.js'

/*
The provider against the page it listens to: a save button, a marked field, and
the toast Payload raises when a save fails. forumone-2026#805.
*/

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn()
  document.body.innerHTML = `
    <button id="action-save-draft">Save draft</button>
    <div class="field-type text" id="field-title"><input name="title" /></div>
    <ol data-sonner-toaster id="toaster"></ol>
    <div id="app"></div>`
  host = document.getElementById('app')!
  root = createRoot(host)
  await act(async () => {
    root.render(createElement(FirstErrorProvider, null, createElement('p', null, 'admin')))
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
})

/** What a failed save does to the page: marks the field, raises an error toast. */
function failSave() {
  document.getElementById('field-title')!.classList.add('error')
  const toast = document.createElement('li')
  toast.setAttribute('data-sonner-toast', '')
  toast.setAttribute('data-type', 'error')
  document.getElementById('toaster')!.appendChild(toast)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

describe('FirstErrorProvider', () => {
  it('renders the admin inside it', () => {
    expect(host.textContent).toBe('admin')
  })

  it('goes to the first error after a save the editor asked for fails', async () => {
    document.getElementById('action-save-draft')!.click()
    failSave()
    await settle()
    expect(document.activeElement).toBe(document.querySelector('input[name="title"]'))
  })

  it('stays put after a failure nobody clicked for, which is what an autosave is', async () => {
    failSave()
    await settle()
    expect(document.activeElement).toBe(document.body)
    expect(document.getElementById('field-title')!.scrollIntoView).not.toHaveBeenCalled()
  })

  it('stands down when the save succeeds', async () => {
    document.getElementById('action-save-draft')!.click()
    const ok = document.createElement('li')
    ok.setAttribute('data-sonner-toast', '')
    ok.setAttribute('data-type', 'success')
    document.getElementById('toaster')!.appendChild(ok)
    await settle()
    // A later failure — an autosave's — is not the click's.
    failSave()
    await settle()
    expect(document.activeElement).toBe(document.body)
  })

  it('follows a promise toast that turns from loading to error in place', async () => {
    const toast = document.createElement('li')
    toast.setAttribute('data-sonner-toast', '')
    toast.setAttribute('data-type', 'loading')
    document.getElementById('toaster')!.appendChild(toast)
    document.getElementById('action-save-draft')!.click()
    document.getElementById('field-title')!.classList.add('error')
    toast.setAttribute('data-type', 'error')
    await settle()
    expect(document.activeElement).toBe(document.querySelector('input[name="title"]'))
  })
})
