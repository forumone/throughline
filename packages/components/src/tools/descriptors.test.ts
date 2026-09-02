import { describe, expect, it } from 'vitest'
import { createTfidfMatcher } from '../matching/tfidf.js'
import { COMPONENTS_TOOL_DESCRIPTORS } from './descriptors.js'
import { createListComponentsTool } from './list-components.js'
import { createGetContractTool } from './get-contract.js'
import { createGetVariantsTool } from './get-variants.js'
import { createGetTokensTool } from './get-tokens.js'
import { createSuggestForIntentTool } from './suggest-for-intent.js'
import { createValidateCompositionTool } from './validate-composition.js'
import { createFindAntiPatternTool } from './find-anti-pattern.js'
import { fixtureLoader, loadFixture } from './_test-helpers.js'

/*
The descriptors and the factories have to agree, because they are read at
different times by different code.

`mcpPlugin` generates one per-key checkbox per *descriptor*, while the host's
config is built, and then gates each call on the checkbox matching the *tool's*
name. A descriptor with no tool advertises something that cannot run; a tool with
no descriptor gets no checkbox, and is therefore denied to every key with no
error anywhere.

The collector refuses both at runtime — this catches them in CI instead, without
a database.
*/

const loaded = loadFixture()
const loader = fixtureLoader(loaded)
const auditWriter = async () => {}

const tools = [
  createListComponentsTool(loader),
  createGetContractTool(loader),
  createGetVariantsTool(loader),
  createGetTokensTool(loader),
  createSuggestForIntentTool({
    loader,
    matcher: createTfidfMatcher(Object.values(loaded.raw.components)),
    auditWriter,
    maxRecommendations: 5,
  }),
  createValidateCompositionTool({ loader, auditWriter }),
  createFindAntiPatternTool({ loader, auditWriter }),
]

describe('components tool descriptors', () => {
  it('names exactly the tools this server builds', () => {
    expect([...COMPONENTS_TOOL_DESCRIPTORS].map(d => d.name).sort()).toEqual(
      tools.map(t => t.name).sort(),
    )
  })

  it('carries the descriptions the tools actually advertise', () => {
    for (const tool of tools) {
      const descriptor = COMPONENTS_TOOL_DESCRIPTORS.find(d => d.name === tool.name)
      expect(descriptor?.description).toBe(tool.description)
    }
  })
})
