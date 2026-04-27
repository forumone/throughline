import { describe, expect, it } from 'vitest'
import { createListComponentsTool } from './list-components.js'
import { callTool, fixtureLoader } from './_test-helpers.js'

describe('list_components', () => {
  it('returns every component when no category is provided', async () => {
    const tool = createListComponentsTool(fixtureLoader())
    const result = (await callTool(tool, {})) as Array<{ name: string }>
    expect(result.length).toBe(12)
  })

  it('filters by category', async () => {
    const tool = createListComponentsTool(fixtureLoader())
    const result = (await callTool(tool, { category: 'hero' })) as Array<{ name: string }>
    expect(result.length).toBe(1)
    expect(result[0]?.name).toBe('Hero')
  })

  it('returns empty for an unknown category', async () => {
    const tool = createListComponentsTool(fixtureLoader())
    const result = (await callTool(tool, { category: 'nope' })) as unknown[]
    expect(result).toEqual([])
  })
})
