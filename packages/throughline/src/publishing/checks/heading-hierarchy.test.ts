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
    expect(issues[0]?.message).toMatch(/2 Hero blocks/)
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
