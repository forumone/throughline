import { describe, expect, it } from 'vitest'
import { createGetTokensTool } from './get-tokens.js'
import { callTool, fixtureLoader } from './_test-helpers.js'

describe('get_tokens', () => {
  it("returns the component's token bindings", async () => {
    const tool = createGetTokensTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Hero' })) as { consumes: string[] }
    expect(result.consumes.length).toBeGreaterThan(0)
  })

  it('errors for unknown components', async () => {
    const tool = createGetTokensTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Ghost' })) as { error: string }
    expect(result.error).toContain('not found')
  })
})
