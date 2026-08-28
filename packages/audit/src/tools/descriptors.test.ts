import { describe, expect, it } from 'vitest'
import { AUDIT_TOOL_DESCRIPTORS } from './descriptors.js'
import { createQueryAuditTool } from './query-audit.js'
import { createGetChangeHistoryTool } from './get-change-history.js'
import { createWhoChangedWhatTool } from './who-changed-what.js'
import { createWhatChangedInRangeTool } from './what-changed-in-range.js'
import { createGetRecentFailuresTool } from './get-recent-failures.js'
import { createFakePayload } from './_test-helpers.js'

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

const deps = { payload: createFakePayload([]), collectionSlug: 'audit-events' }

const tools = [
  createQueryAuditTool(deps),
  createGetChangeHistoryTool(deps),
  createWhoChangedWhatTool(deps),
  createWhatChangedInRangeTool(deps),
  createGetRecentFailuresTool(deps),
]

describe('audit tool descriptors', () => {
  it('names exactly the tools this server builds', () => {
    expect([...AUDIT_TOOL_DESCRIPTORS].map(d => d.name).sort()).toEqual(
      tools.map(t => t.name).sort(),
    )
  })

  /*
  Spread rather than retyped, so this holds structurally — it is here to catch
  somebody "fixing" a description in the factory and leaving the checkbox
  describing something else.
  */
  it('carries the descriptions the tools actually advertise', () => {
    for (const tool of tools) {
      const descriptor = AUDIT_TOOL_DESCRIPTORS.find(d => d.name === tool.name)
      expect(descriptor?.description).toBe(tool.description)
    }
  })
})
