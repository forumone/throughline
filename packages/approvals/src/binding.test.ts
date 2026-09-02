import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { documentContentHash } from '@forumone/throughline-core'
import { createRequestApprovalTool } from './tools/request-approval.js'
import { createApprovalResolver } from './resolver.js'
import { callTool, makeDeps } from './tools/_test-helpers.js'

/*
An approval binds to a hash of the document's content. This is the round
trip that binding has to survive: `request_approval` writes a
`targetVersion`, and later the resolver is asked for a granted approval at
whatever version the publish step computed from the document as it then
stands.

Before #341 the binding was `updatedAt`, so the answer depended on whether
anything had been *saved* between the two, rather than on whether anything
had *changed*. That is what kept autosave off.
*/

const page = {
  id: 'p1',
  title: 'Climate program page',
  slug: 'climate-program',
  updatedAt: '2026-04-23T12:00:00.000Z',
  layout: [{ id: 'b1', blockType: 'Hero', heading: 'A decade of work' }],
}

/** Runs `request_approval` against `document` and returns what it bound to. */
async function requestApproval(document: Record<string, unknown>): Promise<string> {
  const deps = makeDeps({ document })
  await callTool(createRequestApprovalTool(deps), {
    collection: 'pages',
    id: 'p1',
    changesSummary: 'Updated headline copy and added a new program section.',
    approverGroups: ['editorial'],
  })
  const created = deps.spies.payloadCreate.mock.calls[0]?.[0] as {
    data: { targetVersion: string }
  }
  return created.data.targetVersion
}

/**
 * Stands in for the publish step, which loads the document and asks the
 * resolver for a grant at its content hash.
 */
async function resolveAtVersionOf(
  document: Record<string, unknown>,
  granted: { targetVersion: string },
) {
  const find = vi.fn(
    async (args: { where: { and: Array<Record<string, { equals: unknown }>> } }) => {
      const wanted = args.where.and.find((c) => 'targetVersion' in c)?.['targetVersion']?.equals
      const matches = wanted === granted.targetVersion
      return {
        docs: matches
          ? [{ ...granted, id: 'apr_1', decidedAt: '2026-04-23T13:00:00.000Z', decidedBy: 'usr_2' }]
          : [],
        totalDocs: matches ? 1 : 0,
      }
    },
  )
  const resolver = createApprovalResolver({ payload: { find } as unknown as Payload })
  return resolver.getActiveApproval('pages', 'p1', await documentContentHash(document))
}

describe('approval binding', () => {
  it('binds to the content hash rather than to `updatedAt`', async () => {
    expect(await requestApproval(page)).toBe(await documentContentHash(page))
  })

  it('survives a save that changed nothing', async () => {
    const targetVersion = await requestApproval(page)
    const saved = { ...page, updatedAt: '2026-04-23T12:45:31.000Z' }
    await expect(resolveAtVersionOf(saved, { targetVersion })).resolves.toMatchObject({
      id: 'apr_1',
    })
  })

  // Autosave: `updatedAt` moves every couple of seconds of an open tab, and
  // under the old binding each tick invalidated the pending approval.
  it('survives a run of autosaves that changed nothing', async () => {
    const targetVersion = await requestApproval(page)
    for (const second of ['05', '07', '09', '11']) {
      const tick = { ...page, updatedAt: `2026-04-23T12:45:${second}.000Z` }
      await expect(resolveAtVersionOf(tick, { targetVersion })).resolves.not.toBeNull()
    }
  })

  it('is invalidated by an edit to the document', async () => {
    const targetVersion = await requestApproval(page)
    const edited = { ...page, title: 'Climate Program page' }
    await expect(resolveAtVersionOf(edited, { targetVersion })).resolves.toBeNull()
  })

  it('is invalidated by an edit inside a block', async () => {
    const targetVersion = await requestApproval(page)
    const edited = {
      ...page,
      layout: [{ ...page.layout[0], heading: 'Two decades of work' }],
    }
    await expect(resolveAtVersionOf(edited, { targetVersion })).resolves.toBeNull()
  })

  it('is invalidated by an edit that is reverted, then valid again', async () => {
    const targetVersion = await requestApproval(page)
    const edited = { ...page, title: 'Climate Program page' }
    await expect(resolveAtVersionOf(edited, { targetVersion })).resolves.toBeNull()
    const reverted = { ...page, updatedAt: '2026-04-23T14:00:00.000Z' }
    await expect(resolveAtVersionOf(reverted, { targetVersion })).resolves.not.toBeNull()
  })
})
