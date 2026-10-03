import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'

const DRAFT_WRITES_KEY = '__throughlinePublishingDraftWrites'

type DraftWriteRegistry = Record<string, boolean>

/**
 * Records whether the update in flight is a draft write, so the
 * status-write hook can tell a draft save apart from an unpublish.
 *
 * It has to be recorded here because `beforeChange` cannot work it out:
 * Payload sets `data._status = 'draft'` for any `draft: true` update
 * *before* calling the hook, whether or not the caller supplied it —
 *
 *     const isSavingDraft = Boolean(draftArg && hasDraftsEnabled(config))
 *       && data._status !== 'published' && !publishAllLocales
 *     if (isSavingDraft) { data._status = 'draft' }
 *
 * so by the time `beforeChange` runs, saving a draft of a published
 * document and unpublishing it look identical: `data._status` is `'draft'`
 * and `originalDoc._status` is `'published'` in both cases.
 *
 * `beforeOperation` is the one place that sees the operation's own `draft`
 * argument, and it sees it identically on the Local API, REST and GraphQL —
 * unlike `req.query.draft`, which is only populated on the REST path.
 * `beforeOperation` shares `req.context` with `beforeChange`, which is how
 * the flag gets across.
 */
export function createRecordDraftWritesHook(): CollectionBeforeOperationHook {
  return ({ args, operation, req }) => {
    // `update` and `updateByID` both arrive as the `update` hook operation.
    if (operation !== 'update') return

    const updateArgs = args as { draft?: unknown; id?: number | string }
    const slug = collectionSlug(args)
    if (!slug) return

    registry(req)[draftWriteKey(slug, updateArgs.id)] = updateArgs.draft === true
  }
}

/**
 * Whether the update in flight on this document is a draft write.
 *
 * Defaults to `false` when nothing was recorded, so a caller that installs
 * the status-write hook without this one keeps the stricter behaviour.
 */
export function isDraftWrite(
  req: Pick<PayloadRequest, 'context'> | undefined,
  collectionSlug: string | undefined,
  id: unknown,
): boolean {
  if (!req || !collectionSlug) return false
  const entries = (req.context as Record<string, unknown> | undefined)?.[
    DRAFT_WRITES_KEY
  ] as DraftWriteRegistry | undefined
  if (!entries) return false

  // Keyed per document so a nested write to a different document during the
  // same request cannot be mistaken for this one.
  const scoped = entries[draftWriteKey(collectionSlug, id)]
  if (scoped !== undefined) return scoped

  // Bulk updates match by `where` and carry no id.
  return entries[draftWriteKey(collectionSlug, undefined)] === true
}

function draftWriteKey(collectionSlug: string, id: unknown): string {
  return `${collectionSlug}:${id === undefined || id === null ? '*' : String(id)}`
}

function collectionSlug(args: unknown): string | undefined {
  const slug = (args as { collection?: { config?: { slug?: unknown } } })?.collection?.config
    ?.slug
  return typeof slug === 'string' ? slug : undefined
}

function registry(req: PayloadRequest): DraftWriteRegistry {
  // Payload always assigns `req.context`, but attach it if absent rather
  // than writing the flag to an object nothing else can see.
  if (!req.context) {
    req.context = {} as PayloadRequest['context']
  }
  const context = req.context as unknown as Record<string, unknown>
  if (!context[DRAFT_WRITES_KEY]) {
    context[DRAFT_WRITES_KEY] = {} satisfies DraftWriteRegistry
  }
  return context[DRAFT_WRITES_KEY] as DraftWriteRegistry
}
