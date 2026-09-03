import { describe, expect, it, vi } from 'vitest'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { resolvePublishingActor } from './actor.js'
import { createGetPublishStatusTool } from './get-publish-status.js'
import { createPublishTool } from './publish.js'
import { createRollbackTool } from './rollback.js'
import { createSchedulePublishTool } from './schedule-publish.js'
import { createUnpublishTool } from './unpublish.js'
import { anonymousContext, callTool, fakeContext, makeDeps } from './_test-helpers.js'

/*
The gate that was missing from all five publishing tools.

Audit 04 F-02, the most serious finding in that pass: every other Throughline
MCP server gates its tools and this one gated none, so `publish`, `unpublish`,
`rollback` and `schedulePublish` ran at the Local API default of
`overrideAccess: true` on any document in any collection. It was never
exercised — the auditor held no MCP key — so these are the assertions that
turn it from source-read into covered.

Two properties, and both matter separately:

1. **An unauthenticated call is refused.** This is the branch that actually
   fires in production, because `plugin-mcp` never assigns `req.user`.
2. **An authenticated call carries `enforceAccessAs`.** This is what makes the
   collection's own `update` rule — the thing that separates an editor from an
   approver — get consulted at all. Asserted as the *positive* direction too,
   because a guard that refuses everything would satisfy (1) and take the
   publishing tools off a working install.
*/

const TOOLS: Array<[string, (deps: ReturnType<typeof makeDeps>) => McpToolDefinition]> = [
  ['publish', deps => createPublishTool(deps)],
  ['unpublish', deps => createUnpublishTool(deps)],
  ['rollback', deps => createRollbackTool(deps)],
  ['schedulePublish', deps => createSchedulePublishTool(deps)],
  ['getPublishStatus', deps => createGetPublishStatusTool(deps)],
]

const ARGS: Record<string, Record<string, unknown>> = {
  publish: { collection: 'pages', id: 'p1' },
  unpublish: { collection: 'pages', id: 'p1' },
  rollback: { collection: 'pages', id: 'p1', versionId: 'v_old' },
  schedulePublish: {
    collection: 'pages',
    id: 'p1',
    publishAt: new Date(Date.now() + 86_400_000).toISOString(),
  },
  getPublishStatus: { collection: 'pages', id: 'p1' },
}

describe('resolvePublishingActor', () => {
  it('refuses a context with no user', () => {
    const resolved = resolvePublishingActor({ user: null, apiKeyName: 'k' })
    expect(resolved).toHaveProperty('error')
    expect((resolved as { error: string }).error).toMatch(/must be authenticated/i)
  })

  it('says why an API key alone is not enough', () => {
    // The message is the interface: the caller is a model, and "denied" without
    // a reason invites a retry loop.
    const resolved = resolvePublishingActor({ user: null, apiKeyName: 'k' })
    expect((resolved as { error: string }).error).toMatch(/identity/i)
  })

  it('sets enforceAccessAs to the caller, which is the entire fix', () => {
    const resolved = resolvePublishingActor(fakeContext)
    expect(resolved).not.toHaveProperty('error')
    expect(resolved).toMatchObject({
      user: fakeContext.user,
      apiKeyName: 'test-key',
      channel: 'mcp',
      enforceAccessAs: fakeContext.user,
    })
  })
})

describe('every publishing tool refuses an unauthenticated call', () => {
  /*
  Table-driven over all five, so a sixth tool added without the guard fails
  here. That is the shape of the original defect: four tools written to one
  pattern and nothing asserting the pattern.
  */
  it.each(TOOLS)('%s', async (name, create) => {
    const deps = makeDeps({
      payloadFindVersions: vi.fn(async () => ({ docs: [{ id: 'v_old', parent: 'p1' }], totalDocs: 1 })),
    })

    const result = (await callTool(create(deps), ARGS[name]!, anonymousContext)) as {
      error?: string
    }

    expect(result.error, `${name} did not refuse an anonymous caller`).toMatch(
      /must be authenticated/i,
    )
  })

  it.each(TOOLS)('%s touches the database at all', async (name, create) => {
    // The refusal has to happen *before* any read or write, not after one.
    const deps = makeDeps({
      payloadFindVersions: vi.fn(async () => ({ docs: [{ id: 'v_old', parent: 'p1' }], totalDocs: 1 })),
    })

    await callTool(create(deps), ARGS[name]!, anonymousContext)

    expect(deps.spies.payloadUpdate, `${name} wrote`).not.toHaveBeenCalled()
    expect(deps.spies.payloadRestoreVersion, `${name} restored`).not.toHaveBeenCalled()
    expect(deps.spies.payloadFindByID, `${name} read`).not.toHaveBeenCalled()
  })

  it('writes no audit row for a call it never performed', async () => {
    const deps = makeDeps()
    await callTool(createPublishTool(deps), ARGS['publish']!, anonymousContext)
    expect(deps.auditMock).not.toHaveBeenCalled()
  })
})

describe('an authenticated call still works', () => {
  /*
  The direction a refuse-everything guard would break, and the reason it is
  asserted separately: audit 03 T-06 is the finding that a required-field guard
  had thirty-six tests and not one that a supplied value is accepted, so
  mutating it to never refuse survived the whole suite. Same shape here in
  reverse.
  */
  it('reaches the pipeline rather than the guard', async () => {
    const deps = makeDeps()
    const result = (await callTool(createPublishTool(deps), ARGS['publish']!)) as {
      error?: string
      published?: boolean
    }

    expect(result.error).toBeUndefined()
    expect(result).toHaveProperty('published')
  })

  it('runs the write as the caller with overrideAccess off', async () => {
    const deps = makeDeps({
      payloadFindVersions: vi.fn(async () => ({ docs: [{ id: 'v_old', parent: 'p1' }], totalDocs: 1 })),
    })

    await callTool(createRollbackTool(deps), ARGS['rollback']!)

    expect(deps.spies.payloadRestoreVersion).toHaveBeenCalledWith(
      expect.objectContaining({ user: fakeContext.user, overrideAccess: false }),
    )
  })
})
