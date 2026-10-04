import type { Block, CollectionConfig, Field, Payload } from 'payload'
import { blockRegistry } from '../../../references/find.js'
import { linkTargetsIn, type LinkTarget } from '../../../references/links.js'
import { resolveCollection } from '../../options.js'
import type { PipelineContext, PipelineIssue, PipelineStep } from '../types.js'

/*
Refuses a publish whose links go to pages readers cannot see (forumone-2026#756).

An internal link stores a relationship and the renderer resolves it when the
page is read. If the target is a draft, in the trash or deleted, the link
renders as nothing or as a 404, and nothing told the editor who published the
page. Moving a page to the trash is routine since the content trash, so this got
likelier rather than rarer.

## Its own step, not an accessibility check

The accessibility checks are pure functions of the document. This one has to
ask the database about other documents, so it is a step with `ctx.payload`, and
it runs after the pure content checks and before the policy steps.

## What it reads

- **The document again, at `depth: 0`.** The pipeline's copy was read at
  Payload's default depth, and population replaces a trashed target with
  `null`: the very link this is looking for would have lost its id.
- **Each linked collection once**, `where: { id: { in } }`, with `trash: true`
  so a trashed target comes back with its `deletedAt` rather than looking
  deleted, and `draft: false` so `_status` is the live row's.
- **The latest draft of unpublished targets**, only in collections that can
  carry a schedule, because a schedule lives on the latest version.

All with `overrideAccess: true`: the question is what a reader will get, not
what the person publishing may read.

## The verdicts

- not found: deleted, an error;
- `deletedAt` set: in the trash, an error;
- drafts enabled and not published: an error, unless the target is publishable
  and has a scheduled publish time, which is a warning. A page scheduled to go
  live with the page it links to is legitimate;
- anything else, including a collection without drafts: published.

A link back to the document being published is skipped: publishing it is what
makes it live.
*/

const CODE = 'link-targets'

type Verdict =
  | { kind: 'published' }
  | { kind: 'deleted' }
  | { kind: 'trash'; title: string | undefined }
  | { kind: 'draft'; title: string | undefined }
  | { kind: 'scheduled'; title: string | undefined }

function keyOf(relationTo: string, id: number | string): string {
  return `${relationTo}\u0000${String(id)}`
}

function configOf(payload: Payload, slug: string): CollectionConfig | undefined {
  const collections = (payload as { collections?: Record<string, { config?: CollectionConfig }> })
    .collections
  return collections?.[slug]?.config
}

/** A label that may be a string, a record of translations, or a function. */
function textOf(label: unknown): string | undefined {
  if (typeof label === 'string' && label.trim() !== '') return label
  if (label && typeof label === 'object') {
    const record = label as Record<string, unknown>
    const preferred = record['en'] ?? Object.values(record).find((v) => typeof v === 'string')
    if (typeof preferred === 'string' && preferred.trim() !== '') return preferred
  }
  return undefined
}

/** `CardGrid` → `Card Grid`, `heroImage` → `Hero image`, for a config with no label. */
function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a'
}

function singularOf(config: CollectionConfig | undefined, slug: string): string {
  const labels = config?.labels as { singular?: unknown } | undefined
  return textOf(labels?.singular) ?? humanize(slug)
}

function blockLabel(block: Block): string {
  const labels = block.labels as { singular?: unknown } | undefined
  return textOf(labels?.singular) ?? humanize(block.slug)
}

/** Where the link is, in the editor's terms: "block 3 (Card Grid)", "the Body field". */
function placeOf(link: LinkTarget): string {
  const { block, top } = link.at
  if (block) return `block ${block.index + 1} (${blockLabel(block.block)})`
  if (top) return `the ${textOf(top.label) ?? humanize(top.name)} field`
  return 'this page'
}

/**
 * The same place as an issue's `where`, which the admin prints before the
 * message: "Block 3 (Card Grid)", "Body". `undefined` when there is no place
 * more particular than the page.
 */
function whereOf(link: LinkTarget): string | undefined {
  const { block, top } = link.at
  if (block) return `Block ${block.index + 1} (${blockLabel(block.block)})`
  if (top) return textOf(top.label) ?? humanize(top.name)
  return undefined
}

function quoted(title: string | undefined): string | undefined {
  return title ? `"${title}"` : undefined
}

/**
 * An issue's message, which goes out beside its `where` and so starts "This
 * link"; a warning is a line on its own, and says where the link is itself.
 */
function messageFor(
  link: LinkTarget,
  verdict: Verdict,
  singular: string,
  placed: boolean,
): string {
  const where = placed ? 'This link' : `A link in ${placeOf(link)}`
  switch (verdict.kind) {
    case 'deleted':
      return `${where} goes to ${article(singular)} ${singular} that has been deleted. Change the link.`
    case 'trash': {
      const name = quoted(verdict.title) ?? `${article(singular)} ${singular}`
      return `${where} goes to ${name}, which is in the trash. Restore it, or change the link.`
    }
    case 'draft': {
      const name = quoted(verdict.title)
      return name
        ? `${where} goes to ${name}, which is a draft, so readers would get a page that doesn't exist. Publish ${name} first, or change the link.`
        : `${where} goes to ${article(singular)} ${singular} that is a draft, so readers would get a page that doesn't exist. Publish it first, or change the link.`
    }
    case 'scheduled': {
      const name = quoted(verdict.title) ?? `${article(singular)} ${singular}`
      return `${where} goes to ${name}, which isn't published yet but is scheduled to be. Until it goes live, readers who follow the link will get a page that doesn't exist.`
    }
    case 'published':
      return ''
  }
}

function hasDrafts(config: CollectionConfig): boolean {
  const { versions } = config
  return Boolean(versions && typeof versions === 'object' && versions.drafts)
}

function titleOf(doc: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = doc?.[field]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** One collection's targets, classified. One query, plus one for unpublished targets that may be scheduled. */
async function classify(
  ctx: PipelineContext,
  slug: string,
  config: CollectionConfig,
  ids: (number | string)[],
): Promise<Map<string, Verdict>> {
  const drafts = hasDrafts(config)
  const titleField = config.admin?.useAsTitle ?? 'id'
  const select: Record<string, true> = { [titleField]: true }
  if (drafts) select['_status'] = true
  if (config.trash) select['deletedAt'] = true

  const found = await ctx.payload.find({
    collection: slug,
    where: { id: { in: ids } },
    draft: false,
    ...(config.trash ? { trash: true } : {}),
    depth: 0,
    overrideAccess: true,
    limit: ids.length,
    pagination: false,
    select,
  })
  const rows = new Map<string, Record<string, unknown>>()
  for (const doc of found.docs as Record<string, unknown>[]) rows.set(String(doc['id']), doc)

  const verdicts = new Map<string, Verdict>()
  const unpublished: (number | string)[] = []
  for (const id of ids) {
    const row = rows.get(String(id))
    if (!row) verdicts.set(String(id), { kind: 'deleted' })
    else if (row['deletedAt'])
      verdicts.set(String(id), { kind: 'trash', title: titleOf(row, titleField) })
    else if (drafts && row['_status'] !== 'published') unpublished.push(id)
    else verdicts.set(String(id), { kind: 'published' })
  }

  const publishable = ctx.options.collections.some((c) => c.slug === slug)
  const scheduledField = publishable
    ? resolveCollection(ctx.options, slug).scheduledPublishField
    : undefined
  let latest = new Map<string, Record<string, unknown>>()
  if (unpublished.length > 0) {
    const drafted = await ctx.payload.find({
      collection: slug,
      where: { id: { in: unpublished } },
      draft: true,
      depth: 0,
      overrideAccess: true,
      limit: unpublished.length,
      pagination: false,
      select: { [titleField]: true, ...(scheduledField ? { [scheduledField]: true } : {}) },
    })
    latest = new Map((drafted.docs as Record<string, unknown>[]).map((d) => [String(d['id']), d]))
  }
  for (const id of unpublished) {
    const draft = latest.get(String(id))
    const title = titleOf(draft, titleField) ?? titleOf(rows.get(String(id)), titleField)
    const scheduled = scheduledField ? draft?.[scheduledField] : undefined
    verdicts.set(
      String(id),
      scheduled !== undefined && scheduled !== null && scheduled !== ''
        ? { kind: 'scheduled', title }
        : { kind: 'draft', title },
    )
  }
  return verdicts
}

/** The document as stored, ids unpopulated; the pipeline's copy when it cannot be read. */
async function storedDocument(ctx: PipelineContext): Promise<Record<string, unknown>> {
  const stored = await ctx.payload.findByID({
    collection: ctx.collection.slug,
    id: ctx.documentId,
    draft: true,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  return (stored as Record<string, unknown> | null) ?? ctx.document
}

export const linkTargetsStep: PipelineStep = async (ctx) => {
  if (ctx.options.linkTargets?.enabled === false) return { pass: true }

  const own = configOf(ctx.payload, ctx.collection.slug)
  if (!own) return { pass: true }

  let links: LinkTarget[]
  const verdicts = new Map<string, Verdict>()
  try {
    const data = await storedDocument(ctx)
    links = linkTargetsIn(own.fields as Field[], data, {
      blocks: blockRegistry(ctx.payload),
    }).filter(
      (link) => !(link.relationTo === ctx.collection.slug && String(link.id) === ctx.documentId),
    )
    if (links.length === 0) return { pass: true }

    const byCollection = new Map<string, Map<string, number | string>>()
    for (const link of links) {
      const ids = byCollection.get(link.relationTo) ?? new Map<string, number | string>()
      ids.set(String(link.id), link.id)
      byCollection.set(link.relationTo, ids)
    }
    for (const [slug, ids] of byCollection) {
      const config = configOf(ctx.payload, slug)
      // A collection the config no longer has: nothing to ask, and nothing a reader can reach either way.
      if (!config) continue
      for (const [id, verdict] of await classify(ctx, slug, config, [...ids.values()])) {
        verdicts.set(keyOf(slug, id), verdict)
      }
    }
  } catch (error) {
    ctx.payload.logger?.error?.(
      { err: error },
      '[publishing] link-targets: could not read link targets',
    )
    return {
      pass: false,
      code: CODE,
      reason:
        "Couldn't check where this page's links go, so it hasn't been published. Try again, and if it keeps happening, tell a site administrator.",
    }
  }

  const errors: PipelineIssue[] = []
  const warnings: string[] = []
  for (const link of links) {
    const verdict = verdicts.get(keyOf(link.relationTo, link.id))
    if (!verdict || verdict.kind === 'published') continue
    const singular = singularOf(configOf(ctx.payload, link.relationTo), link.relationTo)
    if (verdict.kind === 'scheduled') {
      warnings.push(messageFor(link, verdict, singular, false))
      continue
    }
    const where = whereOf(link)
    errors.push({
      field: link.at.dataPath,
      message: messageFor(link, verdict, singular, where !== undefined),
      severity: 'error',
      rule: verdict.kind,
      ...(where ? { where } : {}),
    })
  }

  const carried = warnings.length ? { warnings } : {}
  if (errors.length === 0) return { pass: true, ...carried }

  return {
    ...carried,
    pass: false,
    code: CODE,
    reason:
      errors.length === 1
        ? "1 link goes to a page readers can't see."
        : `${errors.length} links go to pages readers can't see.`,
    issues: errors,
  }
}
