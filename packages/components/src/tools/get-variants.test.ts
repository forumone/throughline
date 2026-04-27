import { describe, expect, it } from 'vitest'
import { createGetVariantsTool } from './get-variants.js'
import { callTool, fixtureLoader } from './_test-helpers.js'

describe('get_variants', () => {
  it("returns the component's variants", async () => {
    const tool = createGetVariantsTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Hero' })) as { variants: Array<{ name: string }> }
    const names = result.variants.map((v) => v.name)
    expect(names).toContain('default')
    expect(names).toContain('compact')
    expect(names).toContain('split')
  })

  it('returns an empty list for components without variants', async () => {
    const tool = createGetVariantsTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Spacer' })) as { variants: unknown[] }
    expect(Array.isArray(result.variants)).toBe(true)
  })

  it('errors for unknown components', async () => {
    const tool = createGetVariantsTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Ghost' })) as { error: string }
    expect(result.error).toContain('not found')
  })
})
