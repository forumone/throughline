import { describe, expect, it } from 'vitest'
import { FORMS_TOOL_DESCRIPTORS } from './descriptors.js'
import { createListAllowedDestinationsTool } from './list-allowed-destinations.js'
import { createValidateFormTool } from './validate-form.js'
import { createCreateFormTool } from './create-form.js'
import { createUpdateFormFieldsTool } from './update-form-fields.js'
import { createUpdateFormDestinationsTool } from './update-form-destinations.js'
import { createGetFormSubmissionsTool } from './get-form-submissions.js'
import { createFakePayload, makeResolvedConfig } from './_test-helpers.js'

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

const resolved = makeResolvedConfig()
const { payload } = createFakePayload()

const tools = [
  createListAllowedDestinationsTool({ options: resolved.options }),
  createValidateFormTool({ options: resolved.options }),
  createCreateFormTool({ payload, resolved }),
  createUpdateFormFieldsTool({ payload, resolved }),
  createUpdateFormDestinationsTool({ payload, resolved }),
  createGetFormSubmissionsTool({ payload, resolved }),
]

describe('forms tool descriptors', () => {
  it('names exactly the tools this server builds', () => {
    expect([...FORMS_TOOL_DESCRIPTORS].map(d => d.name).sort()).toEqual(
      tools.map(t => t.name).sort(),
    )
  })

  it('carries the descriptions the tools actually advertise', () => {
    for (const tool of tools) {
      const descriptor = FORMS_TOOL_DESCRIPTORS.find(d => d.name === tool.name)
      expect(descriptor?.description).toBe(tool.description)
    }
  })
})
