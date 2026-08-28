import { describe, expect, it } from 'vitest'
import { IntegrationRegistry } from '../registry.js'
import { INTEGRATIONS_TOOL_DESCRIPTORS } from './descriptors.js'
import { createListIntegrationsTool } from './list-integrations.js'
import { createGetIntegrationStatusTool } from './get-integration-status.js'
import { createTriggerSyncTool } from './trigger-sync.js'
import { createTestIntegrationTool } from './test-integration.js'
import { createListIntegrationTypesTool } from './list-integration-types.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

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

const collectionSlug = 'integrations'
const { payload } = createFakePayload([])
const { inngest } = createFakeInngest()
const registry = new IntegrationRegistry()

const tools = [
  createListIntegrationsTool({ payload, collectionSlug }),
  createGetIntegrationStatusTool({ payload, collectionSlug }),
  createTriggerSyncTool({ payload, collectionSlug, inngest }),
  createTestIntegrationTool({ payload, collectionSlug, registry }),
  createListIntegrationTypesTool({ registry }),
]

describe('integrations tool descriptors', () => {
  it('names exactly the tools this server builds', () => {
    expect([...INTEGRATIONS_TOOL_DESCRIPTORS].map(d => d.name).sort()).toEqual(
      tools.map(t => t.name).sort(),
    )
  })

  it('carries the descriptions the tools actually advertise', () => {
    for (const tool of tools) {
      const descriptor = INTEGRATIONS_TOOL_DESCRIPTORS.find(d => d.name === tool.name)
      expect(descriptor?.description).toBe(tool.description)
    }
  })
})
