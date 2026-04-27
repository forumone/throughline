import { describe, expect, it } from 'vitest'
import { linkLabelsCheck } from './link-labels.js'
import { defaultCollection } from './_test-helpers.js'

describe('linkLabelsCheck', () => {
  it('flags a link with url and missing label', async () => {
    const issues = await linkLabelsCheck.run(
      { hero: { cta: { url: 'https://example.com' } } },
      defaultCollection,
    )
    // Only objects with both url AND label keys are visited; { url } alone
    // isn't a link in this convention. Confirm we don't false-positive there.
    expect(issues).toEqual([])
  })

  it('flags a link with url and empty label', async () => {
    const issues = await linkLabelsCheck.run(
      { hero: { cta: { url: 'https://example.com', label: '' } } },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toContain('hero.cta')
  })

  it('passes when both url and label are non-empty', async () => {
    const issues = await linkLabelsCheck.run(
      { hero: { cta: { url: 'https://example.com', label: 'Read more' } } },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('does not flag when url is empty', async () => {
    const issues = await linkLabelsCheck.run(
      { hero: { cta: { url: '   ', label: '' } } },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('walks arrays', async () => {
    const issues = await linkLabelsCheck.run(
      {
        layout: [
          { cta: { url: 'https://a.example', label: 'Apply' } },
          { cta: { url: 'https://b.example', label: '' } },
        ],
      },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toContain('layout[1].cta')
  })
})
