import type { Block, CollectionSlug, Field, Payload, PayloadRequest } from 'payload'
import { COMPONENTS_VALIDATOR_SYMBOL } from '../publishing/pipeline/steps/composition.js'

/*
What stands between an agent and a saved draft, beyond the person's own access.

A draft save in the admin skips Payload's field validation — that is what lets
an editor save half a page — and so does a draft saved through the Local API.
So the two checks the admin's *picker* makes before anything is saved, which
blocks may be added and whether the page still composes, are made here
explicitly. Required fields and the rest are the publish pipeline's to enforce,
exactly as they are for an editor.
*/

/** Why each field an agent might reach for is not its to set. */
const REASONS: Readonly<Record<string, string>> = {
  _status:
    'Writes are always drafts. Going live is publish, schedule_publish or request_approval.',
  publishedAt: 'Set when the document is published, by the publishing tools.',
  scheduledPublishAt: 'Set by schedule_publish.',
  policy: 'The approval policy is set by a person in the admin, not over MCP.',
  narration: 'Generated when the article is narrated.',
  readTime: 'Calculated from the body.',
  legacy: 'The record of an import, which nothing should change.',
  id: 'Assigned by the database.',
  createdAt: 'Maintained by Payload.',
  updatedAt: 'Maintained by Payload.',
  deletedAt: 'A document is trashed in the admin, not over MCP.',
}

export interface RefusedField {
  field: string
  reason: string
}

/** Every top-level key in `data` that is not on the allow-list, with why. */
export function refusedFields(
  data: Record<string, unknown>,
  allowed: readonly string[],
): RefusedField[] {
  const permitted = new Set(allowed)
  return Object.keys(data)
    .filter((key) => !permitted.has(key))
    .map((field) => ({
      field,
      reason:
        REASONS[field] ??
        `Not a field an author may set over MCP here. Settable: ${allowed.join(', ')}.`,
    }))
}

/*
`update_draft` changes the fields it is given and leaves the rest. A group is
merged, so setting `meta.title` keeps `meta.description`; an array or a blocks
field is replaced whole, because its rows have no names to merge by — the block
tools change one block at a time.
*/
export function mergePatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: readonly Field[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    const field = fields.find((f) => 'name' in f && f.name === key)
    out[key] =
      field?.type === 'group' && isPlainObject(value) && isPlainObject(current[key])
        ? mergeGroup(current[key] as Record<string, unknown>, value, fieldsOf(field))
        : value
  }
  return out
}

function mergeGroup(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: readonly Field[],
): Record<string, unknown> {
  return { ...current, ...mergePatch(current, patch, fields) }
}

function fieldsOf(field: Field): readonly Field[] {
  return 'fields' in field && Array.isArray(field.fields) ? field.fields : []
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/* ------------------------------------------------------------------------ */

export interface LockHolder {
  /** Who has it open: their name, else their email, else their id. */
  user: string
  /** Whether that is the person the key belongs to. */
  self: boolean
  /** When the lock was last refreshed. */
  since: string
}

/*
Whether somebody has the document open in the admin.

Payload's own check lets a write through when the lock is the writer's — but
the person behind an MCP key may well have the page open in another tab, and
their form autosaves every couple of seconds over whatever was written here.
Worse, an update deletes the lock it found, so the editor's tab would not even
know. So any fresh lock refuses, the key holder's included, and says whose it is.
*/
export async function lockHolder(
  payload: Payload,
  collection: string,
  id: number | string,
  self: unknown,
): Promise<LockHolder | undefined> {
  const config = payload.collections[collection as CollectionSlug]?.config
  const setting = config?.lockDocuments
  if (setting === false || !payload.collections['payload-locked-documents' as CollectionSlug]) {
    return undefined
  }
  const duration = (typeof setting === 'object' ? setting.duration : 300) * 1000

  const { docs } = await payload.find({
    collection: 'payload-locked-documents' as CollectionSlug,
    where: {
      and: [
        { 'document.relationTo': { equals: collection } },
        { 'document.value': { equals: id } },
      ],
    },
    sort: '-updatedAt',
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const lock = docs[0] as
    | { updatedAt?: string; user?: { value?: Record<string, unknown> | number | string } }
    | undefined
  if (!lock?.updatedAt) return undefined
  if (Date.now() - Date.parse(lock.updatedAt) > duration) return undefined

  const holder = lock.user?.value
  const person = holder && typeof holder === 'object' ? holder : { id: holder }
  const name = [person['name'], person['email'], person['id']].find(
    (value) => typeof value === 'string' || typeof value === 'number',
  )
  return {
    user: String(name ?? 'somebody'),
    self: person['id'] !== undefined && String(person['id']) === String(self),
    since: lock.updatedAt,
  }
}

export function lockRefusal(collection: string, id: number | string, lock: LockHolder) {
  return {
    error: lock.self
      ? `You have ${collection} ${id} open in the admin, and it autosaves over anything written here. Close it, or wait for its lock to lapse, then try again.`
      : `${lock.user} has ${collection} ${id} open in the admin, so writing to it now would overwrite their work or be overwritten by it. Try again once they have closed it.`,
    lockedBy: lock.user,
    since: lock.since,
  }
}

/* ------------------------------------------------------------------------ */

/**
 * The blocks in `rows` that `field` would not let an editor add, asked the way
 * the picker asks: with the document's current rows as sibling data, so a block
 * a document already holds stays allowed (it is how `filterOptions` keeps old
 * documents saveable).
 */
export async function disallowedBlocks(
  field: Extract<Field, { type: 'blocks' }>,
  rows: readonly unknown[],
  currentRows: readonly unknown[],
  registry: ReadonlyMap<string, Block>,
  req: PayloadRequest,
): Promise<string[]> {
  const known = new Set<string>([
    ...(field.blocks ?? []).map((block) => block.slug),
    ...(field.blockReferences ?? []).flatMap((ref) => {
      const slug = typeof ref === 'string' ? ref : ref.slug
      return registry.has(slug) || typeof ref !== 'string' ? [slug] : []
    }),
  ])
  let allowed: ReadonlySet<string> = known
  if (typeof field.filterOptions === 'function') {
    const answer = await field.filterOptions({
      data: { [field.name]: currentRows },
      siblingData: { [field.name]: currentRows },
      id: undefined as never,
      req,
      user: req.user,
    } as never)
    if (Array.isArray(answer)) allowed = new Set(answer as string[])
  }
  const types = rows.map((row) => (row as { blockType?: unknown } | null)?.blockType)
  return [
    ...new Set(
      types.map((type) =>
        typeof type === 'string' && known.has(type) && allowed.has(type)
          ? undefined
          : String(type ?? '(no blockType)'),
      ),
    ),
  ].filter((type): type is string => type !== undefined)
}

export interface CompositionIssue {
  rule: string
  message: string
  /** Which row, when the rule is about one. */
  index?: number
}

type ComponentValidator = (input: {
  blocks: Array<{ type: string; variant?: string; composed?: boolean }>
}) =>
  | Promise<{ issues: Array<{ severity: string; rule: string; message: string; blockIndex?: number }> }>
  | { issues: Array<{ severity: string; rule: string; message: string; blockIndex?: number }> }

/**
 * The composition errors in a blocks field's rows, from the same validator the
 * publish pipeline runs (attached by the components plugin). Warnings do not
 * stop a publish and do not stop a draft. `undefined` when there is no
 * validator, which is a site without the components plugin.
 */
export async function compositionErrors(
  payload: Payload,
  rows: readonly unknown[],
  /** A composed section's block type: kept in the order, not checked as a component. */
  composedBlockType?: string,
): Promise<CompositionIssue[] | undefined> {
  const validator = (payload as unknown as Record<symbol, unknown>)[COMPONENTS_VALIDATOR_SYMBOL] as
    | ComponentValidator
    | undefined
  if (!validator) return undefined
  const blocks = rows.flatMap((row): { type: string; variant?: string; composed?: boolean }[] => {
    const r = row as { blockType?: unknown; variant?: unknown } | null
    if (typeof r?.blockType !== 'string') return []
    if (r.blockType === composedBlockType) return [{ type: r.blockType, composed: true }]
    return [typeof r.variant === 'string' ? { type: r.blockType, variant: r.variant } : { type: r.blockType }]
  })
  if (blocks.length === 0) return []
  const result = await validator({ blocks })
  return result.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => ({
      rule: issue.rule,
      message: issue.message,
      ...(issue.blockIndex !== undefined ? { index: issue.blockIndex } : {}),
    }))
}
