import { z } from 'zod'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import { fakeContext } from '../publishing/tools/_test-helpers.js'
import { createAuthoringTools, delegate, type AuthoringDeps } from './tools.js'
import { adminOnly } from './surface.js'

/*
The authoring tools route; the module tools they call do the work and have
their own tests. So these check the routing — which module tool, with what —
and the two things that live here: who may take something live, and a publish
that needs approval filing the request.
*/

const as = (roles: string[]): McpToolContext => ({
  ...fakeContext,
  user: { ...fakeContext.user!, roles },
})
const admin = as(['admin'])
const editor = as(['editor'])
const approver = as(['approver'])

/** A module tool that records what it was called with and answers `answer`. */
function moduleTool(
  name: string,
  answer: Record<string, unknown> = { ok: name },
  schema?: z.ZodObject<z.ZodRawShape>,
) {
  const handler = vi.fn(async (_input: unknown, _ctx: McpToolContext) => answer)
  return {
    name,
    description: name,
    inputSchema: schema ?? z.object({}).passthrough(),
    handler,
  } as unknown as McpToolDefinition & {
    handler: typeof handler
  }
}

function setup(
  overrides: Record<string, ReturnType<typeof moduleTool> | undefined> = {},
  deps: Partial<AuthoringDeps> = {},
) {
  const names = [
    'find_related',
    'list_my_work',
    'find_documents',
    'search_content',
    'describe_content_type',
    'get_document',
    'create_draft',
    'update_draft',
    'edit_blocks',
    'get_publish_status',
    'publish',
    'schedule_publish',
    'unpublish',
    'rollback',
    'request_approval',
    'get_contract',
    'suggest_for_intent',
    'get_recipe_vocabulary',
    'list_components',
    'validate_recipe',
    'save_recipe',
  ]
  const tools = new Map<string, ReturnType<typeof moduleTool>>(names.map((n) => [n, moduleTool(n)]))
  for (const [name, tool] of Object.entries(overrides)) {
    if (tool) tools.set(name, tool)
    else tools.delete(name)
  }
  const findVersions = vi.fn(async () => ({
    docs: [{ id: 7, updatedAt: '2026-10-01', version: { _status: 'published' } }],
  }))
  const authoring = createAuthoringTools({
    inner: { definition: (name) => tools.get(name) },
    payload: { findVersions } as unknown as Payload,
    contentTypes: ['pages', 'posts'],
    kinds: ['people', 'media'],
    approverGroups: [{ slug: 'comms', name: 'Comms' }],
    ...deps,
  })
  const tool = (name: string) => {
    const found = authoring.find((t) => t.name === name)!
    return (input: Record<string, unknown>, ctx: McpToolContext = editor) =>
      found.handler(found.inputSchema.parse(input), ctx) as Promise<Record<string, unknown>>
  }
  const called = (name: string) => tools.get(name)!.handler.mock.calls.map(([input]) => input)
  return { tool, called, tools, findVersions, authoring }
}

describe('the authoring tools', () => {
  it('are the eight, in order', () => {
    expect(setup().authoring.map((t) => t.name)).toEqual([
      'find',
      'get',
      'save_draft',
      'edit_blocks',
      'check',
      'publish',
      'design_guide',
      'compose_section',
    ])
  })
})

describe('find', () => {
  it('routes by what it is asked for', async () => {
    const s = setup()
    await s.tool('find')({ kind: 'people', query: 'Ann', where: { team: 'design' } })
    await s.tool('find')({ mine: true })
    await s.tool('find')({ collection: 'posts', query: 'speed', limit: 5 })
    await s.tool('find')({ query: 'speed' })
    expect(s.called('find_related')).toEqual([
      { kind: 'people', query: 'Ann', where: { team: 'design' } },
    ])
    expect(s.called('list_my_work')).toEqual([{}])
    expect(s.called('find_documents')).toEqual([{ collection: 'posts', query: 'speed', limit: 5 }])
    expect(s.called('search_content')).toEqual([{ query: 'speed' }])
  })

  it('searches each content type in turn when the site has no palette', async () => {
    const s = setup({
      search_content: undefined,
      find_documents: moduleTool('find_documents', { results: [{ id: 1, title: 'Speed' }] }),
    })
    const out = await s.tool('find')({ query: 'speed' })
    expect(s.called('find_documents').map((i) => (i as { collection: string }).collection)).toEqual(
      ['pages', 'posts'],
    )
    expect(out).toEqual({
      query: 'speed',
      results: [
        { collection: 'pages', id: 1, title: 'Speed' },
        { collection: 'posts', id: 1, title: 'Speed' },
      ],
    })
  })

  it('asks for something to look for', async () => {
    expect(await setup().tool('find')({})).toMatchObject({
      error: expect.stringContaining('query'),
    })
  })
})

describe('get', () => {
  it('lists the content types, describes one, or reads a document', async () => {
    const s = setup()
    expect(await s.tool('get')({})).toMatchObject({
      contentTypes: ['pages', 'posts'],
      kinds: ['people', 'media'],
    })
    await s.tool('get')({ collection: 'posts' })
    await s.tool('get')({ collection: 'posts', id: 4, draft: false })
    expect(s.called('describe_content_type')).toEqual([{ collection: 'posts' }])
    expect(s.called('get_document')).toEqual([{ collection: 'posts', id: 4, draft: false }])
  })

  it('adds the recent versions as the caller may read them', async () => {
    const s = setup()
    const out = await s.tool('get')({ collection: 'posts', id: 4, versions: true })
    expect(out['versions']).toEqual([
      { versionId: '7', updatedAt: '2026-10-01', status: 'published' },
    ])
    expect(s.findVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        where: { parent: { equals: 4 } },
        overrideAccess: false,
        user: editor.user,
      }),
    )
  })
})

describe('save_draft', () => {
  it('creates without an id, and changes only the given fields with one', async () => {
    const s = setup()
    const meta = { userPrompt: 'Write it' }
    await s.tool('save_draft')({ collection: 'posts', data: { title: 'New' }, _meta: meta })
    await s.tool('save_draft')({ collection: 'posts', id: 9, data: { title: 'Renamed' } })
    expect(s.called('create_draft')).toEqual([
      { collection: 'posts', data: { title: 'New' }, _meta: meta },
    ])
    expect(s.called('update_draft')).toEqual([
      { collection: 'posts', id: 9, patch: { title: 'Renamed' } },
    ])
  })
})

describe('edit_blocks and check', () => {
  it('pass through to the module tools', async () => {
    const s = setup()
    const ops = {
      collection: 'pages',
      id: 2,
      field: 'layout',
      operations: [{ op: 'remove', blockId: 'a' }],
    }
    await s.tool('edit_blocks')(ops)
    await s.tool('check')({ collection: 'pages', id: 2 })
    expect(s.called('edit_blocks')).toEqual([ops])
    expect(s.called('get_publish_status')).toEqual([{ collection: 'pages', id: '2' }])
  })
})

describe('publish', () => {
  const target = { collection: 'pages', id: 2 }
  const approval = {
    changesSummary: 'Rewrote the introduction and the CTA.',
    approverGroups: ['comms'],
  }

  it('takes something live for an editor or an admin, and refuses anyone else', async () => {
    const s = setup()
    await s.tool('publish')({ ...target, action: 'now' }, editor)
    await s.tool('publish')({ ...target, action: 'unpublish' }, admin)
    expect(s.called('publish')).toEqual([{ collection: 'pages', id: '2' }])
    expect(s.called('unpublish')).toEqual([{ collection: 'pages', id: '2' }])

    for (const action of ['now', 'schedule', 'unpublish', 'rollback']) {
      const out = await s.tool('publish')(
        { ...target, action, at: '2026-11-02T09:00:00-05:00', versionId: 'v1' },
        approver,
      )
      expect(out, action).toMatchObject({ error: expect.stringContaining('editor or an admin') })
    }
    expect(s.called('publish')).toHaveLength(1)
  })

  it('lets anyone signed in request approval', async () => {
    const s = setup()
    await s.tool('publish')(
      { ...target, action: 'request_approval', approval: { ...approval, reason: 'Launch' } },
      approver,
    )
    expect(s.called('request_approval')).toEqual([
      {
        collection: 'pages',
        id: '2',
        changesSummary: approval.changesSummary,
        approverGroups: ['comms'],
        requestReason: 'Launch',
      },
    ])
  })

  it('says what to do when approval is required, naming the groups', async () => {
    const s = setup({
      publish: moduleTool('publish', {
        published: false,
        code: 'approval-required',
        reason: 'No approval.',
      }),
    })
    const out = await s.tool('publish')({ ...target, action: 'now' })
    expect(out).toMatchObject({
      published: false,
      approvalRequired: true,
      next: expect.stringContaining('comms'),
    })
    expect(s.called('request_approval')).toEqual([])
  })

  it('files the request itself when approval is required and given', async () => {
    const s = setup({
      publish: moduleTool('publish', { published: false, code: 'approval-required' }),
      request_approval: moduleTool('request_approval', { approvalId: 'r1', status: 'pending' }),
    })
    const out = await s.tool('publish')({ ...target, action: 'now', approval })
    expect(out).toEqual({
      published: false,
      approvalRequired: true,
      approvalRequest: { approvalId: 'r1', status: 'pending' },
    })
  })

  it('needs `at` to schedule and `versionId` to roll back', async () => {
    const s = setup()
    expect(await s.tool('publish')({ ...target, action: 'schedule' })).toMatchObject({
      error: expect.stringContaining('`at`'),
    })
    expect(await s.tool('publish')({ ...target, action: 'rollback' })).toMatchObject({
      error: expect.stringContaining('versionId'),
    })
    await s.tool('publish')({ ...target, action: 'schedule', at: '2026-11-02T09:00:00-05:00' })
    await s.tool('publish')({ ...target, action: 'rollback', versionId: 'v1' })
    // A Postgres version id is a number; the module tool takes a string. Found end to end.
    await s.tool('publish')({ ...target, action: 'rollback', versionId: 5 })
    expect(s.called('schedule_publish')).toEqual([
      { collection: 'pages', id: '2', publishAt: '2026-11-02T09:00:00-05:00' },
    ])
    expect(s.called('rollback')).toEqual([
      { collection: 'pages', id: '2', versionId: 'v1' },
      { collection: 'pages', id: '2', versionId: '5' },
    ])
  })

  it("takes the site's own rule for who may publish", async () => {
    const s = setup({}, { canPublish: (ctx) => Boolean(ctx.user?.roles.includes('approver')) })
    expect(await s.tool('publish')({ ...target, action: 'now' }, editor)).toMatchObject({
      error: expect.any(String),
    })
    await s.tool('publish')({ ...target, action: 'now' }, approver)
    expect(s.called('publish')).toHaveLength(1)
  })
})

describe('design_guide and compose_section', () => {
  it('route to the components tools', async () => {
    const s = setup()
    await s.tool('design_guide')({ component: 'Hero' })
    await s.tool('design_guide')({ intent: 'A strong call to action', existingBlocks: ['Hero'] })
    await s.tool('design_guide')({ recipes: true })
    await s.tool('design_guide')({ category: 'cta' })
    expect(s.called('get_contract')).toEqual([{ name: 'Hero' }])
    expect(s.called('suggest_for_intent')).toEqual([
      { intent: 'A strong call to action', context: { existingBlocks: ['Hero'] } },
    ])
    expect(s.called('get_recipe_vocabulary')).toEqual([{}])
    expect(s.called('list_components')).toEqual([{ category: 'cta' }])
  })

  it('checks a recipe, or saves it', async () => {
    const s = setup()
    const recipe = { contract: { name: 'Band' }, tree: { primitive: 'Section' } }
    await s.tool('compose_section')(recipe)
    await s.tool('compose_section')({ ...recipe, save: true, id: 'r1' })
    expect(s.called('validate_recipe')).toEqual([recipe])
    expect(s.called('save_recipe')).toEqual([{ ...recipe, id: 'r1' }])
  })
})

describe('delegate', () => {
  it('says when a module tool is off, and when the input does not fit it', async () => {
    const strict = moduleTool('strict', {}, z.object({ id: z.string() }))
    const inner = { definition: (name: string) => (name === 'strict' ? strict : undefined) }
    expect(await delegate(inner, 'gone', {}, editor)).toMatchObject({
      error: expect.stringContaining('gone is off'),
    })
    expect(await delegate(inner, 'strict', { id: 3 }, editor)).toMatchObject({
      error: expect.stringContaining('Invalid input'),
    })
    expect(strict.handler).not.toHaveBeenCalled()
  })
})

describe('adminOnly', () => {
  it('runs an operations tool for an admin and refuses everyone else', async () => {
    const tool = moduleTool('query_audit')
    const guarded = adminOnly(tool)
    expect(await guarded.handler({}, admin)).toEqual({ ok: 'query_audit' })
    expect(await guarded.handler({}, editor)).toMatchObject({
      error: expect.stringContaining('administrator'),
    })
    expect(tool.handler).toHaveBeenCalledTimes(1)
  })
})

describe('a pending approval (#832)', () => {
  const pending = { id: 'r1', createdAt: '2026-10-04T10:00:00Z', expiresAt: '2026-10-11T10:00:00Z' }
  it('is named by check, which says not to request another', async () => {
    const find = vi.fn(async () => ({ docs: [pending] }))
    const s = setup(
      {
        get_publish_status: moduleTool('get_publish_status', {
          wouldPublish: { canPublish: false, blockers: [{ code: 'approval-required' }] },
        }),
      },
      { approvalsCollection: 'approval-requests', payload: { find } as unknown as Payload },
    )
    const out = await s.tool('check')({ collection: 'pages', id: 2 })
    expect(out).toMatchObject({
      pendingApproval: { approvalId: 'r1', expiresAt: '2026-10-11T10:00:00Z' },
      next: expect.stringContaining('Do not request another'),
    })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'approval-requests',
        overrideAccess: false,
        where: { and: [{ targetCollection: { equals: 'pages' } }, { targetId: { equals: '2' } }, { status: { equals: 'pending' } }] },
      }),
    )
  })

  it('stops publish from filing a second request', async () => {
    const s = setup(
      { publish: moduleTool('publish', { published: false, code: 'approval-required' }) },
      { approvalsCollection: 'approval-requests', payload: { find: vi.fn(async () => ({ docs: [pending] })) } as unknown as Payload },
    )
    const out = await s.tool('publish')({
      collection: 'pages',
      id: 2,
      action: 'now',
      approval: { changesSummary: 'A new page about the partner program.', approverGroups: ['comms'] },
    })
    expect(out).toMatchObject({ approvalRequired: true, pendingApproval: { approvalId: 'r1' } })
    expect(s.called('request_approval')).toEqual([])
  })

  it('is not looked for when approvals are off', async () => {
    const s = setup({
      get_publish_status: moduleTool('get_publish_status', {
        wouldPublish: { canPublish: false, blockers: [{ code: 'approval-required' }] },
      }),
    })
    expect(await s.tool('check')({ collection: 'pages', id: 2 })).not.toHaveProperty('pendingApproval')
  })
})

describe('design_guide for a component (#832)', () => {
  it('says how each kind of value is written', async () => {
    const s = setup({ get_contract: moduleTool('get_contract', { name: 'CTA' }) }, { blockRichText: true })
    const out = await s.tool('design_guide')({ component: 'CTA' })
    expect(out).toMatchObject({ name: 'CTA', valueShapes: { link: expect.stringContaining('Never a plain string') } })
  })
})

