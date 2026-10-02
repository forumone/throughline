import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'
import type { HealthCheck, HealthRow } from './checks.js'

/*
The one read behind the content-health view, its dashboard summary and the
`find_content_needing_attention` tool. All three call this, so the admin and an
agent see the same rows.

Everything is read as the person asking, with `overrideAccess: false`. The one
exception is a check's `refine` step (images in use), which asks a question
about the database rather than about the viewer and returns only ids.

A collection that fails is left out and logged rather than failing the page; a
check whose `refine` throws reports `failed` rather than "nothing found", since
"could not check" must not read as "all clear".
*/

/** One collection's share of a check. */
export interface HealthGroup {
  collection: string
  label: string
  singular: string
  /** The query the count ran, for a link to the list it counted. */
  where: Where
  total: number
  /** The first rows, up to the limit. Empty in a summary. */
  rows: HealthRow[]
  /** Matched the `where` but were dropped by `refine`: images with no alt that nothing uses. */
  excluded?: number
}

export interface HealthCheckResult {
  id: string
  label: string
  description?: string
  empty: string
  groups: HealthGroup[]
  /** Set when the check did not run: `costly` in a summary, `failed` when its read threw. */
  skipped?: 'costly' | 'failed'
}

export interface HealthReport {
  generatedAt: string
  checks: HealthCheckResult[]
}

export interface FindContentNeedingAttentionOptions {
  checks: readonly HealthCheck[]
  /** Who is asking. Their access decides what is counted. */
  user: PayloadRequest['user']
  now?: Date
  /** `summary`: counts only, costly checks skipped, for the dashboard. Default `full`. */
  scope?: 'summary' | 'full'
  /** Rows per collection. Default 10. */
  limit?: number
  /** Only these check ids. */
  only?: readonly string[]
}

function labelsOf(payload: Payload, slug: string): { label: string; singular: string } {
  const { plural, singular } = payload.collections[slug as CollectionSlug]?.config.labels ?? {}
  return {
    label: typeof plural === 'string' ? plural : slug,
    singular: typeof singular === 'string' ? singular : slug,
  }
}

function titleOf(doc: Record<string, unknown>): string {
  for (const key of ['title', 'name', 'filename', 'slug']) {
    const value = doc[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return 'Untitled'
}

function rowOf(check: HealthCheck, doc: Record<string, unknown>, now: Date): HealthRow {
  return {
    id: doc['id'] as number | string,
    title: titleOf(doc),
    ...(check.describe ? check.describe(doc, now) : {}),
  }
}

async function runGroup(
  payload: Payload,
  check: HealthCheck,
  collection: CollectionSlug,
  options: Required<Pick<FindContentNeedingAttentionOptions, 'scope' | 'limit'>> & {
    user: PayloadRequest['user']
    now: Date
  },
): Promise<HealthGroup | null> {
  const where = check.where(collection, options.now)
  if (!where) return null
  const base = { ...labelsOf(payload, collection), collection, where }
  const access = { overrideAccess: false, user: options.user } as const

  if (options.scope === 'summary') {
    const { totalDocs } = await payload.count({ collection, where, ...access })
    return { ...base, total: totalDocs, rows: [] }
  }

  // Every match when the order or the refine step needs the whole set; otherwise a page.
  const all = Boolean(check.order || check.refine)
  const result = await payload.find({
    collection,
    where,
    depth: 0,
    ...(all ? { limit: 0, pagination: false } : { limit: options.limit }),
    ...(check.sort && !check.order ? { sort: check.sort } : {}),
    select: { ...check.select } as never,
    ...access,
  })
  let docs = result.docs as unknown as Record<string, unknown>[]
  let excluded: number | undefined
  if (check.refine) {
    const kept = await check.refine(docs, payload)
    excluded = docs.length - kept.length
    docs = kept
  }
  let rows = docs.map((doc) => rowOf(check, doc, options.now))
  if (check.order) rows = rows.sort(check.order)
  return {
    ...base,
    total: check.refine ? docs.length : result.totalDocs,
    rows: rows.slice(0, options.limit),
    ...(excluded !== undefined ? { excluded } : {}),
  }
}

/** What needs attention, by check and collection. */
export async function findContentNeedingAttention(
  payload: Payload,
  options: FindContentNeedingAttentionOptions,
): Promise<HealthReport> {
  const now = options.now ?? new Date()
  const scope = options.scope ?? 'full'
  const limit = options.limit ?? 10
  const checks = options.only
    ? options.checks.filter((check) => options.only!.includes(check.id))
    : options.checks

  const results = await Promise.all(
    checks.map(async (check): Promise<HealthCheckResult> => {
      const head = {
        id: check.id,
        label: check.label,
        ...(check.description ? { description: check.description } : {}),
        empty: check.empty,
      }
      if (scope === 'summary' && check.costly) return { ...head, groups: [], skipped: 'costly' }

      const settled = await Promise.allSettled(
        check.collections.map((collection) =>
          runGroup(payload, check, collection, { scope, limit, user: options.user, now }),
        ),
      )
      const groups: HealthGroup[] = []
      let failed = 0
      for (const outcome of settled) {
        if (outcome.status === 'rejected') {
          failed += 1
          payload.logger.warn(
            { err: outcome.reason, check: check.id },
            'Content health: a collection did not answer.',
          )
        } else if (outcome.value) {
          groups.push(outcome.value)
        }
      }
      // Every collection failed: that is "could not check", not "nothing found".
      if (failed > 0 && groups.length === 0) return { ...head, groups: [], skipped: 'failed' }
      return { ...head, groups }
    }),
  )

  return { generatedAt: now.toISOString(), checks: results }
}
