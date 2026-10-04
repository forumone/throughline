import { z } from 'zod'
import type { CollectionSlug, Payload } from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolCollector } from '../mcp/collector.js'
import { deniedEnvelope } from '../mcp/envelope.js'
import { withMeta } from '../mcp/meta.js'
import { formatZodIssues } from '../utils/zod-issues.js'
import { editBlocksInput } from '../content/blocks.js'
import { AUTHORING_TOOLS } from './descriptors.js'
import { valueShapes } from '../content/values.js'

/*
The eight authoring tools. Each picks the module tool that does what it was
asked and calls that tool's handler, with the same context, so access, audit
and every check are the module's own. What lives here is the routing, the
role check on publishing, and the one composite step: a publish that needs
approval filing the request.
*/

export interface AuthoringDeps {
  /** Where the module tools were built. Only `definition` is used. */
  inner: Pick<McpToolCollector, 'definition'>
  payload: Payload
  /** The content types the content tools write, by slug, for the descriptions. */
  contentTypes: readonly string[]
  /** What `find` can look up with `kind`, e.g. people, media. */
  kinds: readonly string[]
  /** The approver groups a request may go to. Empty when approvals are off. */
  approverGroups: readonly { slug: string; name: string }[]
  /** Who may take something live. Default: an admin or an editor. */
  canPublish?: (ctx: McpToolContext) => boolean
  /** Where approval requests are kept, to say when one is already pending. Unset when approvals are off. */
  approvalsCollection?: string
  /** Whether rich text inside a block takes Markdown, for `design_guide`'s value shapes. */
  blockRichText?: boolean
}

const PUBLISHER_ROLES = ['admin', 'editor']

export function defaultCanPublish(ctx: McpToolContext): boolean {
  return Boolean(ctx.user?.roles.some((role) => PUBLISHER_ROLES.includes(role)))
}

type Result = Record<string, unknown>

/** Calls a module tool's handler, parsing the input against its own schema. */
export async function delegate(
  inner: AuthoringDeps['inner'],
  name: string,
  input: Record<string, unknown>,
  ctx: McpToolContext,
): Promise<Result> {
  const tool = inner.definition(name)
  if (!tool) return { error: `This site does not offer that (${name} is off).` }
  const parsed = tool.inputSchema.safeParse(withoutUndefined(input))
  if (!parsed.success) return { error: `Invalid input: ${formatZodIssues(parsed.error)}` }
  return (await tool.handler(parsed.data, ctx)) as Result
}

function withoutUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

const id = z
  .union([z.string(), z.number()])
  .describe('The document id, as `find` or `get` gives it.')

/* ------------------------------------------------------------------------ */

function findTool(deps: AuthoringDeps) {
  const inputSchema = z.object({
    query: z
      .string()
      .optional()
      .describe(
        'Words to match against titles (and slugs). Optional with `collection`, `kind` or `mine`.',
      ),
    collection: z
      .string()
      .optional()
      .describe(
        `One content type to search, by slug: ${deps.contentTypes.join(', ')}. Without it, every content type is searched.`,
      ),
    kind: z
      .string()
      .optional()
      .describe(
        deps.kinds.length > 0
          ? `Something to link or attach rather than a page: ${deps.kinds.join(', ')}.`
          : 'Not available on this site.',
      ),
    where: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('With `kind`: exact values to filter on, by field, where the kind allows it.'),
    mine: z.boolean().optional().describe('Your own unpublished drafts and scheduled publishes.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('At most this many results. Default 10.'),
  })
  return {
    ...AUTHORING_TOOLS.find,
    inputSchema,
    handler: async (input: z.infer<typeof inputSchema>, ctx: McpToolContext) => {
      if (input.kind) {
        return delegate(
          deps.inner,
          'find_related',
          { kind: input.kind, query: input.query, where: input.where, limit: input.limit },
          ctx,
        )
      }
      if (input.mine) return delegate(deps.inner, 'list_my_work', {}, ctx)
      if (input.collection) {
        return delegate(
          deps.inner,
          'find_documents',
          { collection: input.collection, query: input.query, limit: input.limit },
          ctx,
        )
      }
      if (!input.query) {
        return { error: 'Give a `query`, or one of `collection`, `kind` or `mine`.' }
      }
      if (deps.inner.definition('search_content')) {
        return delegate(
          deps.inner,
          'search_content',
          { query: input.query, perCollection: input.limit },
          ctx,
        )
      }
      // No palette on this site: the content types one at a time.
      const results: Result[] = []
      for (const collection of deps.contentTypes) {
        const found = await delegate(
          deps.inner,
          'find_documents',
          { collection, query: input.query, limit: input.limit ?? 5 },
          ctx,
        )
        if ('error' in found) return found
        for (const row of (found['results'] as Result[] | undefined) ?? [])
          results.push({ collection, ...row })
      }
      return { query: input.query, results }
    },
  } satisfies McpToolDefinition<typeof inputSchema>
}

function getTool(deps: AuthoringDeps) {
  const inputSchema = z.object({
    collection: z
      .string()
      .optional()
      .describe(`The content type, by slug: ${deps.contentTypes.join(', ')}.`),
    id: id.optional(),
    draft: z
      .boolean()
      .optional()
      .describe('With `id`: the latest draft (default) or, false, what is published.'),
    versions: z
      .boolean()
      .optional()
      .describe(
        'With `id`: also list its ten most recent versions, for `publish` with action "rollback".',
      ),
  })
  return {
    ...AUTHORING_TOOLS.get,
    inputSchema,
    handler: async (input: z.infer<typeof inputSchema>, ctx: McpToolContext) => {
      if (!input.collection) {
        return {
          contentTypes: deps.contentTypes,
          kinds: deps.kinds,
          next: 'Call get with a collection to see what you can write to it.',
        }
      }
      if (input.id === undefined) {
        return delegate(deps.inner, 'describe_content_type', { collection: input.collection }, ctx)
      }
      const doc = await delegate(
        deps.inner,
        'get_document',
        { collection: input.collection, id: input.id, draft: input.draft },
        ctx,
      )
      if ('error' in doc || !input.versions) return doc
      return {
        ...doc,
        versions: await recentVersions(deps.payload, input.collection, input.id, ctx),
      }
    },
  } satisfies McpToolDefinition<typeof inputSchema>
}

/** The document's recent versions, as the caller may read them. */
async function recentVersions(
  payload: Payload,
  collection: string,
  parent: string | number,
  ctx: McpToolContext,
): Promise<Result[]> {
  const found = await payload.findVersions({
    collection: collection as CollectionSlug,
    where: { parent: { equals: parent } },
    sort: '-updatedAt',
    limit: 10,
    depth: 0,
    overrideAccess: false,
    ...(ctx.user ? { user: ctx.user as never } : {}),
  })
  return found.docs.map((version) => {
    const v = version as unknown as Result & { version?: Result }
    return {
      versionId: String(v['id']),
      updatedAt: v['updatedAt'],
      status: v.version?.['_status'] ?? null,
      ...(v['autosave'] ? { autosave: true } : {}),
    }
  })
}

function saveDraftTool(deps: AuthoringDeps) {
  const inputSchema = withMeta({
    collection: z.string().describe(`The content type, by slug: ${deps.contentTypes.join(', ')}.`),
    id: id.optional().describe('The document to change. Omit to create a new one.'),
    data: z
      .record(z.string(), z.unknown())
      .describe(
        'The fields to set, by name, as `get` with only `collection` lists them. When changing, only the fields to change.',
      ),
  })
  return {
    ...AUTHORING_TOOLS.saveDraft,
    inputSchema,
    handler: async (input: z.infer<typeof inputSchema>, ctx: McpToolContext) =>
      input.id === undefined
        ? delegate(
            deps.inner,
            'create_draft',
            { collection: input.collection, data: input.data, _meta: input._meta },
            ctx,
          )
        : delegate(
            deps.inner,
            'update_draft',
            { collection: input.collection, id: input.id, patch: input.data, _meta: input._meta },
            ctx,
          ),
  } satisfies McpToolDefinition<typeof inputSchema>
}

function editBlocksTool(deps: AuthoringDeps) {
  // The content module's own schema, so the two cannot disagree about what validates.
  return {
    ...AUTHORING_TOOLS.editBlocks,
    inputSchema: editBlocksInput,
    handler: (input: z.infer<typeof editBlocksInput>, ctx: McpToolContext) =>
      delegate(deps.inner, 'edit_blocks', input as Result, ctx),
  } satisfies McpToolDefinition<typeof editBlocksInput>
}

function checkTool(deps: AuthoringDeps) {
  const inputSchema = z.object({
    collection: z.string().describe('The content type, by slug.'),
    id,
  })
  return {
    ...AUTHORING_TOOLS.check,
    inputSchema,
    handler: async (input: z.infer<typeof inputSchema>, ctx: McpToolContext) => {
      const status = await delegate(
        deps.inner,
        'get_publish_status',
        { collection: input.collection, id: String(input.id) },
        ctx,
      )
      const blockers = ((status['wouldPublish'] as Result | undefined)?.['blockers'] ?? []) as Result[]
      if (!blockers.some((b) => b['code'] === 'approval-required')) return status
      const pending = await pendingApproval(deps, input.collection, input.id, ctx)
      return pending
        ? {
            ...status,
            pendingApproval: pending,
            next: 'An approval request is already pending; it goes live once an approver grants it. Do not request another.',
          }
        : status
    },
  } satisfies McpToolDefinition<typeof inputSchema>
}

/**
 * The pending approval request for a document, as the caller may read it, or
 * `undefined`. So `check` and `publish` say a request is waiting rather than
 * suggesting a second one. forumone-2026#832.
 */
async function pendingApproval(
  deps: AuthoringDeps,
  collection: string,
  id: string | number,
  ctx: McpToolContext,
): Promise<Result | undefined> {
  if (!deps.approvalsCollection) return undefined
  const found = await deps.payload.find({
    collection: deps.approvalsCollection as CollectionSlug,
    where: {
      and: [
        { targetCollection: { equals: collection } },
        { targetId: { equals: String(id) } },
        { status: { equals: 'pending' } },
      ],
    },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    ...(ctx.user ? { user: ctx.user as never } : {}),
  })
  const request = found.docs[0] as Result | undefined
  if (!request) return undefined
  return {
    approvalId: request['id'],
    requestedAt: request['createdAt'],
    ...(request['expiresAt'] ? { expiresAt: request['expiresAt'] } : {}),
  }
}

const LIVE_ACTIONS = new Set(['now', 'schedule', 'unpublish', 'rollback'])

function publishTool(deps: AuthoringDeps) {
  const canPublish = deps.canPublish ?? defaultCanPublish
  const groups = deps.approverGroups.map((group) => group.slug)
  const approval = z
    .object({
      changesSummary: z
        .string()
        .min(20)
        .describe('What changed and why, for the approvers. At least 20 characters.'),
      approverGroups: z
        .array(z.string())
        .min(1)
        .describe(
          groups.length > 0
            ? `Who should approve: one or more of ${groups.join(', ')}.`
            : 'Approvals are off on this site.',
        ),
      reason: z.string().optional().describe('Why it needs approving now, if there is a deadline.'),
    })
    .describe(
      'For "request_approval", or for "now" on a document that needs approval: who to ask, and what to tell them.',
    )
  const inputSchema = withMeta({
    collection: z.string().describe('The content type, by slug.'),
    id,
    action: z
      .enum(['now', 'schedule', 'unpublish', 'rollback', 'request_approval'])
      .describe('What to do. See the tool description.'),
    at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe(
        'For "schedule": when, as an ISO 8601 date and time with an offset, e.g. 2026-11-02T09:00:00-05:00.',
      ),
    versionId: z
      .union([z.string(), z.number()])
      .optional()
      .describe('For "rollback": the version to restore, from `get` with `versions`.'),
    approval: approval.optional(),
  })

  return {
    ...AUTHORING_TOOLS.publish,
    inputSchema,
    handler: async (input: z.infer<typeof inputSchema>, ctx: McpToolContext): Promise<Result> => {
      if (!ctx.user) return deniedEnvelope('Publishing needs a signed-in person behind the key.')
      if (LIVE_ACTIONS.has(input.action) && !canPublish(ctx)) {
        return deniedEnvelope(
          `Taking something live needs an editor or an admin, and ${ctx.user.name ?? ctx.user.email} is ${ctx.user.roles.join(', ') || 'neither'}. ` +
            'Use action "request_approval" to ask someone who can.',
        )
      }
      const target = { collection: input.collection, id: String(input.id), _meta: input._meta }
      const requestApproval = (a: z.infer<typeof approval>) =>
        delegate(
          deps.inner,
          'request_approval',
          {
            ...target,
            changesSummary: a.changesSummary,
            approverGroups: a.approverGroups,
            requestReason: a.reason,
          },
          ctx,
        )

      switch (input.action) {
        case 'now': {
          const outcome = await delegate(deps.inner, 'publish', target, ctx)
          if (outcome['code'] !== 'approval-required') return outcome
          const pending = await pendingApproval(deps, input.collection, input.id, ctx)
          if (pending) {
            return {
              ...outcome,
              approvalRequired: true,
              pendingApproval: pending,
              next: 'An approval request is already pending. It goes live once an approver grants it, by publishing again; no second request is needed.',
            }
          }
          if (input.approval) {
            return {
              published: false,
              approvalRequired: true,
              approvalRequest: await requestApproval(input.approval),
            }
          }
          return {
            ...outcome,
            approvalRequired: true,
            next:
              'This needs approval before it can go live. Ask the person who should approve it, then call publish with action "request_approval" and ' +
              `approval: { changesSummary, approverGroups${groups.length > 0 ? ` (one or more of ${groups.join(', ')})` : ''} }.`,
          }
        }
        case 'schedule':
          if (!input.at) return { error: 'Scheduling needs `at`: when to publish.' }
          return delegate(deps.inner, 'schedule_publish', { ...target, publishAt: input.at }, ctx)
        case 'unpublish':
          return delegate(deps.inner, 'unpublish', target, ctx)
        case 'rollback':
          if (!input.versionId)
            return { error: 'A rollback needs `versionId`. `get` with `versions` lists them.' }
          return delegate(
            deps.inner,
            'rollback',
            { ...target, versionId: String(input.versionId) },
            ctx,
          )
        case 'request_approval':
          if (!input.approval)
            return { error: 'A request needs `approval`: { changesSummary, approverGroups }.' }
          return requestApproval(input.approval)
      }
    },
  } satisfies McpToolDefinition<typeof inputSchema>
}

function designGuideTool(deps: AuthoringDeps) {
  const inputSchema = z.object({
    intent: z
      .string()
      .min(5)
      .optional()
      .describe(
        'What the person wants a section or page to do, in their words. Returns the components that suit it, ranked.',
      ),
    existingBlocks: z
      .array(z.string())
      .optional()
      .describe(
        'With `intent`: the block types already on the page, so suggestions that would clash are flagged.',
      ),
    component: z.string().optional().describe('A component by name, for its full contract.'),
    recipes: z
      .boolean()
      .optional()
      .describe('The primitives and inline components a composed section may be built from.'),
    category: z
      .string()
      .optional()
      .describe('With none of the others: list only this category, e.g. "hero", "cta".'),
  })
  return {
    ...AUTHORING_TOOLS.designGuide,
    inputSchema,
    handler: async (input: z.infer<typeof inputSchema>, ctx: McpToolContext) => {
      if (input.component) {
        const contract = await delegate(deps.inner, 'get_contract', { name: input.component }, ctx)
        return 'error' in contract
          ? contract
          : { ...contract, valueShapes: valueShapes({ blockRichText: Boolean(deps.blockRichText) }) }
      }
      if (input.intent) {
        return delegate(
          deps.inner,
          'suggest_for_intent',
          {
            intent: input.intent,
            ...(input.existingBlocks ? { context: { existingBlocks: input.existingBlocks } } : {}),
          },
          ctx,
        )
      }
      if (input.recipes) return delegate(deps.inner, 'get_recipe_vocabulary', {}, ctx)
      return delegate(deps.inner, 'list_components', { category: input.category }, ctx)
    },
  } satisfies McpToolDefinition<typeof inputSchema>
}

function composeSectionTool(deps: AuthoringDeps) {
  const inputSchema = withMeta({
    contract: z
      .record(z.string(), z.unknown())
      .describe("The section's contract: its name, intent and content fields."),
    tree: z
      .record(z.string(), z.unknown())
      .describe(
        "What it renders: primitives and inline components, binding their content to the contract's fields.",
      ),
    save: z
      .boolean()
      .optional()
      .describe('Save it as a draft recipe once it passes. Default: only check it.'),
    id: z
      .union([z.string(), z.number()])
      .optional()
      .describe('With `save`: the draft recipe to replace.'),
  })
  return {
    ...AUTHORING_TOOLS.composeSection,
    inputSchema,
    handler: (input: z.infer<typeof inputSchema>, ctx: McpToolContext) =>
      input.save
        ? delegate(
            deps.inner,
            'save_recipe',
            { contract: input.contract, tree: input.tree, id: input.id, _meta: input._meta },
            ctx,
          )
        : delegate(
            deps.inner,
            'validate_recipe',
            { contract: input.contract, tree: input.tree, _meta: input._meta },
            ctx,
          ),
  } satisfies McpToolDefinition<typeof inputSchema>
}

/** The eight, in the order a client lists them. */
export function createAuthoringTools(deps: AuthoringDeps): McpToolDefinition[] {
  return [
    findTool(deps),
    getTool(deps),
    saveDraftTool(deps),
    editBlocksTool(deps),
    checkTool(deps),
    publishTool(deps),
    designGuideTool(deps),
    composeSectionTool(deps),
  ] as unknown as McpToolDefinition[]
}
