import type { CollectionSlug, Payload, Where } from 'payload'

/*
What "needs attention" means, as data a site configures.

Moved from forumone-2026 (`admin/health/rules.ts`, #757 there), and made into
checks rather than three hard-coded lists, because every rule in it named that
site's schema: its collections, its thresholds, the SEO plugin's field names,
its `revisedAt`. The three factories below are those rules with the names as
options and that site's values as the defaults where they are Payload's or a
plugin's own.

A check is a `where` per collection, so the count, the list it links to and the
MCP tool all run the same query and cannot disagree. A check that needs more
than a `where` (missing alt text needs to know which images are in use) adds a
`refine` step, and says so with `costly`, which keeps it off the dashboard.
*/

/** One row a check found. */
export interface HealthRow {
  id: number | string
  title: string
  /** The date the row is judged by, when the check has one. */
  at?: string
  /** What is wrong, in a few words: "no description or image". */
  note?: string
}

export interface HealthCheck {
  /** Stable id, used by the MCP tool's `checks` filter. */
  id: string
  /** The heading: "Not revised in a year". */
  label: string
  /** One sentence under the heading saying what is and is not judged. */
  description?: string
  /** What to say when nothing is found. */
  empty: string
  /** The collections it runs over, in display order. */
  collections: readonly CollectionSlug[]
  /** The query for one collection, or `null` to skip it. */
  where: (collection: CollectionSlug, now: Date) => Where | null
  /** The fields `describe` and the title need. `id` is always read. */
  select: Record<string, true>
  /** Database sort for the rows. Ignored when `order` is given. */
  sort?: string
  /** In-memory order, for a sort no single column holds. Reads every matching row. */
  order?: (a: HealthRow, b: HealthRow) => number
  /** The row's date and note. */
  describe?: (doc: Record<string, unknown>, now: Date) => Pick<HealthRow, 'at' | 'note'>
  /**
   * A second pass over every matching document, for a rule a `where` cannot
   * state. Returns the ones that count. Implies reading every match.
   */
  refine?: (docs: Record<string, unknown>[], payload: Payload) => Promise<Record<string, unknown>[]>
  /** Too expensive for the dashboard summary: shown only on the full view and to the tool. */
  costly?: boolean
}

/** `now` minus `months` calendar months, as an ISO string. */
export function monthsBefore(now: Date, months: number): string {
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months)
  return cutoff.toISOString()
}

/** The first field of `doc` that holds a parseable date. */
function firstDate(doc: Record<string, unknown>, fields: readonly string[]): string | undefined {
  for (const field of fields) {
    const value = doc[field]
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))) {
      return value
    }
  }
  return undefined
}

/** A dotted path out of a document: `meta.description`. */
function at(doc: Record<string, unknown>, path: string): unknown {
  let value: unknown = doc
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

/** `meta.description` to `{ meta: { description: true } }`, for a `select`. */
function selectOf(paths: readonly string[]): Record<string, true> {
  const select: Record<string, unknown> = {}
  for (const path of paths) {
    const [head, ...rest] = path.split('.') as [string, ...string[]]
    if (rest.length === 0) select[head] = true
    else
      select[head] = {
        ...((select[head] as Record<string, unknown> | undefined) ?? {}),
        ...selectOf([rest.join('.')]),
      }
  }
  return select as Record<string, true>
}

/*
"Published", in a form the count and the list it links to agree on. The count
reads the main row, where `_status` is the live state; the admin list of a
versioned collection reads each document's latest version, where a published
page with unpublished edits says `draft`. A stamped first-publish date carries
into every later draft, so it closes that gap.
*/
function publishedWhere(publishedField: string | false): Where {
  if (publishedField === false) return { _status: { equals: 'published' } }
  return { or: [{ _status: { equals: 'published' } }, { [publishedField]: { exists: true } }] }
}

export interface StaleCheckOptions {
  /** Months without a revision after which a published document is stale, per collection. */
  after: Readonly<Record<string, number>>
  /**
   * The date fields to judge by, most trusted first. A document is dated by the
   * first that is set. Default: `revisedAt`, `publishedAt`, `createdAt`.
   */
  dates?: readonly string[]
  /** The first-publish stamp that marks a document as published in every version. Default `publishedAt`; `false` for none. */
  publishedField?: string | false
  label?: string
  description?: string
  empty?: string
}

/**
 * Published documents not revised within a threshold, oldest first. A
 * collection with no threshold is not judged: a dated post is not a stale one.
 */
export function staleCheck(options: StaleCheckOptions): HealthCheck {
  const dates = options.dates ?? ['revisedAt', 'publishedAt', 'createdAt']
  const published = publishedWhere(options.publishedField ?? 'publishedAt')
  return {
    id: 'stale',
    label: options.label ?? 'Not revised recently',
    ...(options.description ? { description: options.description } : {}),
    empty: options.empty ?? 'Everything has been revised recently.',
    collections: Object.keys(options.after) as CollectionSlug[],
    where: (collection, now) => {
      const months = options.after[collection]
      if (months === undefined) return null
      const cutoff = monthsBefore(now, months)
      // Dated by the first field that is set: each branch says "this one is
      // old and every field before it is empty".
      const branches: Where[] = dates.map((field, index) =>
        index === 0
          ? { [field]: { less_than: cutoff } }
          : {
              and: [
                ...dates.slice(0, index).map((earlier) => ({ [earlier]: { exists: false } })),
                { [field]: { less_than: cutoff } },
              ],
            },
      )
      return { and: [published, { or: branches }] }
    },
    select: selectOf(['title', ...dates]),
    order: (a, b) => (a.at ?? '').localeCompare(b.at ?? ''),
    describe: (doc) => {
      const date = firstDate(doc, dates)
      return date ? { at: date } : { note: 'never dated' }
    },
  }
}

export interface MissingSeoCheckOptions {
  collections: readonly CollectionSlug[]
  /** Field paths. Defaults are `@payloadcms/plugin-seo`'s: `meta.description`, `meta.image`, `meta.noIndex`. */
  fields?: { description?: string; image?: string; noIndex?: string | false }
  publishedField?: string | false
  /** Database sort. Default `-publishedAt`. */
  sort?: string
  label?: string
  description?: string
  empty?: string
}

/** Published, indexable documents with no meta description or no meta image. */
export function missingSeoCheck(options: MissingSeoCheckOptions): HealthCheck {
  const description = options.fields?.description ?? 'meta.description'
  const image = options.fields?.image ?? 'meta.image'
  const noIndex = options.fields?.noIndex === undefined ? 'meta.noIndex' : options.fields.noIndex
  const published = publishedWhere(options.publishedField ?? 'publishedAt')
  const where: Where = {
    and: [
      published,
      ...(noIndex ? [{ [noIndex]: { not_equals: true } }] : []),
      {
        or: [
          { [description]: { exists: false } },
          { [description]: { equals: '' } },
          { [image]: { exists: false } },
        ],
      },
    ],
  }
  return {
    id: 'missing-seo',
    label: options.label ?? 'Missing SEO',
    ...(options.description ? { description: options.description } : {}),
    empty: options.empty ?? 'Every published page has a meta description and image.',
    collections: options.collections,
    where: () => where,
    select: selectOf(['title', description, image]),
    sort: options.sort ?? '-publishedAt',
    describe: (doc) => {
      const missing: string[] = []
      if (!at(doc, description)) missing.push('description')
      const img = at(doc, image)
      if (img === null || img === undefined) missing.push('image')
      return missing.length > 0 ? { note: `no ${missing.join(' or ')}` } : {}
    },
  }
}

export interface MissingAltCheckOptions {
  /** The upload collection. Default `media`. */
  collection?: CollectionSlug
  /** The alt text field. Default `alt`. */
  altField?: string
  /**
   * Only images something uses. Default `true`: an unused upload is on nobody's
   * page. Needs a full read of every document that could hold an image, so the
   * check is `costly`.
   */
  onlyInUse?: boolean
  /** Finds the ids in use. `findReferencedIds` from `@forumone/throughline-core`. */
  inUse?: (payload: Payload, collection: CollectionSlug) => Promise<Set<string>>
  label?: string
  description?: string
  empty?: string
}

/** Image uploads with no alt text, by default only those something uses. */
export function missingAltCheck(options: MissingAltCheckOptions = {}): HealthCheck {
  const collection = options.collection ?? ('media' as CollectionSlug)
  const alt = options.altField ?? 'alt'
  const onlyInUse = options.onlyInUse ?? true
  if (onlyInUse && !options.inUse) {
    throw new Error(
      'missingAltCheck: onlyInUse needs `inUse`, e.g. findReferencedIds from @forumone/throughline-core.',
    )
  }
  const where: Where = {
    and: [
      { mimeType: { like: 'image/' } },
      { or: [{ [alt]: { exists: false } }, { [alt]: { equals: '' } }] },
    ],
  }
  return {
    id: 'missing-alt',
    label:
      options.label ?? (onlyInUse ? 'Images in use without alt text' : 'Images without alt text'),
    ...(options.description ? { description: options.description } : {}),
    empty:
      options.empty ??
      (onlyInUse ? 'Every image in use has alt text.' : 'Every image has alt text.'),
    collections: [collection],
    where: () => where,
    select: { filename: true, updatedAt: true },
    sort: '-updatedAt',
    ...(onlyInUse && options.inUse
      ? {
          costly: true,
          refine: async (docs: Record<string, unknown>[], payload: Payload) => {
            const used = await options.inUse!(payload, collection)
            return docs.filter((doc) => used.has(String(doc['id'])))
          },
        }
      : {}),
  }
}

/**
 * A `where` as the query string the admin list view reads, so a count links to
 * the list it counted. Bracket notation, which is all the list view parses.
 */
export function whereQuery(where: Where): string {
  const pairs: string[] = []
  const walk = (value: unknown, key: string) => {
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${key}[${index}]`))
    else if (value !== null && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) walk(v, `${key}[${k}]`)
    else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  walk(where, 'where')
  return pairs.join('&')
}

/** The admin list for `collection`, filtered by `where`. */
export function listHref(adminRoute: string, collection: string, where: Where): string {
  return `${adminRoute}/collections/${collection}?${whereQuery(where)}`
}
