import { describe, expect, it } from 'vitest'
import { headingHierarchyCheck } from './heading-hierarchy.js'
import { defaultCollection } from './_test-helpers.js'

describe('headingHierarchyCheck', () => {
  it('passes for a layout with one Hero', async () => {
    const issues = await headingHierarchyCheck.run(
      { layout: [{ blockType: 'hero' }, { blockType: 'cardGrid' }] },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('passes for a layout with no Hero', async () => {
    const issues = await headingHierarchyCheck.run(
      { layout: [{ blockType: 'sectionIntro' }] },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('flags a layout with multiple Heroes', async () => {
    const issues = await headingHierarchyCheck.run(
      { layout: [{ blockType: 'hero' }, { blockType: 'hero' }, { blockType: 'cta' }] },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toBe(
      "This page has 2 hero blocks. Keep one; the hero holds the page's main heading.",
    )
  })

  // forumone-2026#805: no design system calls a hero `hero`, so this never fired.
  describe('with the design system’s contracts', () => {
    const context = {
      components: {
        ImageHero: { category: 'hero' },
        VideoHero: { category: 'hero' },
        CardGrid: { category: 'section' },
        hero: { category: 'section' },
      },
    }

    it('counts every block whose contract is in the hero category', async () => {
      const issues = await headingHierarchyCheck.run(
        { layout: [{ blockType: 'ImageHero' }, { blockType: 'CardGrid' }, { blockType: 'VideoHero' }] },
        defaultCollection,
        context,
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]?.message).toMatch(/^This page has 2 hero blocks/)
    })

    it('passes one hero', async () => {
      expect(
        await headingHierarchyCheck.run(
          { layout: [{ blockType: 'ImageHero' }, { blockType: 'CardGrid' }] },
          defaultCollection,
          context,
        ),
      ).toEqual([])
    })

    it('asks the contract rather than the name, when there is a contract', async () => {
      expect(
        await headingHierarchyCheck.run(
          { layout: [{ blockType: 'hero' }, { blockType: 'hero' }] },
          defaultCollection,
          context,
        ),
      ).toEqual([])
    })
  })

  it('matches blockType case-insensitively', async () => {
    const issues = await headingHierarchyCheck.run(
      { layout: [{ blockType: 'Hero' }, { blockType: 'HERO' }] },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
  })

  it('returns no issues when the layout field is missing or non-array', async () => {
    expect(await headingHierarchyCheck.run({}, defaultCollection)).toEqual([])
    expect(await headingHierarchyCheck.run({ layout: 'not an array' }, defaultCollection)).toEqual([])
  })
})
