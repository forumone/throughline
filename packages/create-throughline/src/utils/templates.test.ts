import { describe, expect, it } from 'vitest'
import { renderTemplate } from './templates.js'

describe('renderTemplate', () => {
  it('substitutes a single variable', () => {
    expect(renderTemplate('hi {{name}}', { name: 'Ada' })).toBe('hi Ada')
  })

  it('substitutes multiple variables', () => {
    expect(
      renderTemplate('{{greeting}} {{name}}!', { greeting: 'Hello', name: 'Ada' }),
    ).toBe('Hello Ada!')
  })

  it('treats missing variables as empty strings', () => {
    expect(renderTemplate('hi {{name}}!', {})).toBe('hi !')
  })

  it('treats null/undefined as empty', () => {
    expect(renderTemplate('hi {{name}}!', { name: null })).toBe('hi !')
    expect(renderTemplate('hi {{name}}!', { name: undefined })).toBe('hi !')
  })

  it('coerces non-string values to strings', () => {
    expect(renderTemplate('count: {{n}}', { n: 42 })).toBe('count: 42')
    expect(renderTemplate('flag: {{ok}}', { ok: true })).toBe('flag: true')
  })

  it('renders an if block when truthy', () => {
    expect(renderTemplate('{{#if ok}}yes{{/if}}', { ok: true })).toBe('yes')
  })

  it('skips an if block when falsy', () => {
    expect(renderTemplate('{{#if ok}}yes{{/if}}', { ok: false })).toBe('')
    expect(renderTemplate('{{#if ok}}yes{{/if}}', { ok: '' })).toBe('')
    expect(renderTemplate('{{#if ok}}yes{{/if}}', { ok: 0 })).toBe('')
    expect(renderTemplate('{{#if ok}}yes{{/if}}', {})).toBe('')
  })

  it('honors an else branch', () => {
    expect(renderTemplate('{{#if ok}}yes{{else}}no{{/if}}', { ok: true })).toBe('yes')
    expect(renderTemplate('{{#if ok}}yes{{else}}no{{/if}}', { ok: false })).toBe('no')
  })

  it('expands variables inside an if block', () => {
    expect(
      renderTemplate('{{#if ok}}hello {{name}}{{/if}}', { ok: true, name: 'Ada' }),
    ).toBe('hello Ada')
  })

  it('handles multiple if blocks in one template', () => {
    const tmpl = '{{#if a}}A{{/if}}-{{#if b}}B{{/if}}'
    expect(renderTemplate(tmpl, { a: true, b: false })).toBe('A-')
    expect(renderTemplate(tmpl, { a: false, b: true })).toBe('-B')
  })

  it('does not require a else branch', () => {
    expect(renderTemplate('x{{#if ok}}Y{{/if}}z', { ok: false })).toBe('xz')
  })

  it('leaves untouched text alone', () => {
    expect(renderTemplate('plain text with no markers', {})).toBe('plain text with no markers')
  })

  it('passes through {{ variables that look like JSX braces }}', () => {
    // Variables must be word-only; double-brace text without a valid name is
    // left untouched. (Renderer only matches /\{\{(\w+)\}\}/.)
    expect(renderTemplate('JSX: {{ doubled }} stays', {})).toBe('JSX: {{ doubled }} stays')
  })
})
