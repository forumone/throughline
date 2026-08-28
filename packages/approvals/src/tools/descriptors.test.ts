import { describe, expect, it } from 'vitest'
import { APPROVALS_TOOL_DESCRIPTORS } from './descriptors.js'
import { createRequestApprovalTool } from './request-approval.js'
import { createRespondToApprovalTool } from './respond-to-approval.js'
import { createGetApprovalStatusTool } from './get-approval-status.js'
import { createListPendingApprovalsTool } from './list-pending-approvals.js'
import { createListMyRequestsTool } from './list-my-requests.js'
import { makeDeps } from './_test-helpers.js'

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

const deps = makeDeps()

const tools = [
  createRequestApprovalTool(deps),
  createRespondToApprovalTool(deps),
  createGetApprovalStatusTool(deps),
  createListPendingApprovalsTool(deps),
  createListMyRequestsTool(deps),
]

describe('approvals tool descriptors', () => {
  it('names exactly the tools this server builds', () => {
    expect([...APPROVALS_TOOL_DESCRIPTORS].map(d => d.name).sort()).toEqual(
      tools.map(t => t.name).sort(),
    )
  })

  it('carries the descriptions the tools actually advertise', () => {
    for (const tool of tools) {
      const descriptor = APPROVALS_TOOL_DESCRIPTORS.find(d => d.name === tool.name)
      expect(descriptor?.description).toBe(tool.description)
    }
  })
})
