import { describe, expect, it } from 'vitest'
import { createGetContractTool } from './get-contract.js'
import { callTool, fixtureLoader } from './_test-helpers.js'

describe('get_contract', () => {
  it('returns the full contract for a known component', async () => {
    const tool = createGetContractTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Hero' })) as { name: string }
    expect(result.name).toBe('Hero')
  })

  it('returns an error for an unknown component', async () => {
    const tool = createGetContractTool(fixtureLoader())
    const result = (await callTool(tool, { name: 'Ghost' })) as { error: string }
    expect(result.error).toContain('not found')
  })
})
