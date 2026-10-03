import type { Access } from 'payload'

/*
The render path has no user.

Every query a published page makes runs with nobody signed in, so a
collection's own `read` rule decides whether the page can see its own content.
Tighten one and nothing goes red: the query returns an empty result, the block
renders its empty state, and the site quietly loses a section. The first
Throughline site shipped a forms collection editors-only, and every published
form rendered its heading and no fields — no gate could tell "allowed to read
nothing" from "there is nothing to read".

The opposite mistake is the more expensive one. An audit log, an approval
queue or an API-key collection that answers an anonymous read is a leak.

So the rule is checked as a value, with no database: call each collection's
`read` with an anonymous request and look at what comes back. `true` or a query
means anybody can read it. `false` means nobody signed out can.

**Both directions, and exhaustive.** Listing only the public collections would
let a new private one be added and never checked; listing only the private ones
would let a public one quietly close. Every collection in the config has to be
in exactly one bucket, so adding a collection — yours, or one a plugin brings
— fails until somebody decides which it is.
*/

/** Where each collection sits. Site data: the buckets are the site's decision. */
export interface AnonymousAccessBuckets {
  /**
   * Collections a published page reads with nobody signed in, each with where
   * it is read. Populated relationships count: Payload applies the related
   * collection's own rule when it resolves one at depth, so an upload
   * collection is here whenever a page shows an image.
   */
  renderPath: Readonly<Record<string, string>>
  /**
   * Collections the internet must not read. A reason per entry is optional,
   * and worth writing for anything that is not obvious.
   */
  private: Readonly<Record<string, string>> | readonly string[]
  /**
   * The same two buckets for globals. Omit it when the site has none; when it
   * is given, every global must be in it.
   */
  globals?: {
    renderPath?: Readonly<Record<string, string>>
    private?: Readonly<Record<string, string>> | readonly string[]
  }
}

/** The slice of a collection or global config this reads. */
export interface AccessCheckedEntity {
  slug: string
  access?: { read?: unknown } | undefined
  versions?: unknown
}

/** The slice of a Payload config this reads — a `SanitizedConfig` satisfies it. */
export interface AccessCheckedConfig {
  collections?: readonly AccessCheckedEntity[] | undefined
  globals?: readonly AccessCheckedEntity[] | undefined
}

export type AccessFindingKind =
  /** In the config and in no bucket. */
  | 'unclassified'
  /** In both buckets, or listed twice. */
  | 'classified-twice'
  /** In a bucket and not in the config: renamed, or removed. */
  | 'not-in-config'
  /** On the render path and refusing an anonymous read. */
  | 'render-path-refused'
  /** On the render path with drafts on, and answering a bare `true`. */
  | 'drafts-unfiltered'
  /** Private, and answering an anonymous read with `true` or a query. */
  | 'private-readable'

export interface AccessFinding {
  kind: AccessFindingKind
  /** `collection` or `global`. */
  entity: 'collection' | 'global'
  slug: string
  message: string
}

/**
 * The anonymous request an access rule is handed.
 *
 * `req.payload` is a stub that throws on use rather than a mock that answers:
 * a read rule that looks something up to decide is one this cannot evaluate
 * without a database, and it should say so here rather than pass on a guess.
 */
export function anonymousAccessArgs(): Parameters<Access>[0] {
  const payload = new Proxy(
    {},
    {
      get(_target, property) {
        // Not thenable: an `await req.payload` must not hang on a stub.
        if (property === 'then' || typeof property === 'symbol') return undefined
        return () => {
          throw new Error(
            `An access rule called payload.${property} for an anonymous request. ` +
              'A rule that needs the database cannot be checked as a value; test it against one.',
          )
        }
      },
    },
  )
  return {
    req: { user: null, headers: new Headers(), payload },
  } as unknown as Parameters<Access>[0]
}

/**
 * What a read rule answers an anonymous request: `true`, `false`, a `where`
 * query, or `undefined` when there is no rule at all.
 */
export async function anonymousRead(entity: AccessCheckedEntity): Promise<unknown> {
  const read = entity.access?.read
  if (typeof read !== 'function') return undefined
  return (read as Access)(anonymousAccessArgs())
}

/** Whether an entity keeps drafts, so an anonymous read must be narrowed to published. */
export function hasDrafts(entity: AccessCheckedEntity): boolean {
  const versions = entity.versions as { drafts?: unknown } | boolean | undefined
  return typeof versions === 'object' && versions !== null && Boolean(versions.drafts)
}

/**
 * Why a render-path entity fails, or `undefined` when it passes.
 *
 * `undefined` is a failure here and not in `privateProblem`, deliberately. A
 * collection with no `read` rule gets Payload's default, which requires a user
 * — so leaving one off is the same outage as writing an editors-only rule, and
 * reads in review as though no decision were needed.
 */
export async function renderPathProblem(
  entity: AccessCheckedEntity,
): Promise<{ kind: AccessFindingKind; message: string } | undefined> {
  const answer = await anonymousRead(entity)
  if (answer === undefined) {
    return {
      kind: 'render-path-refused',
      message: `${entity.slug} has no read rule, so Payload's default applies and an anonymous read is refused.`,
    }
  }
  if (answer === false) {
    return {
      kind: 'render-path-refused',
      message: `${entity.slug} refuses an anonymous read, so the render path sees nothing.`,
    }
  }
  /*
  A bare `true` on a collection with drafts serves an unpublished document to
  anybody who guesses its slug. A query is what narrows it — usually
  `{ _status: { equals: 'published' } }` — and which query is the site's call.
  */
  if (answer === true && hasDrafts(entity)) {
    return {
      kind: 'drafts-unfiltered',
      message: `${entity.slug} keeps drafts and answers an anonymous read with \`true\`, so drafts reach the internet. Answer with a query that narrows to published documents.`,
    }
  }
  return undefined
}

/**
 * Why a private entity fails, or `undefined` when it passes.
 *
 * `undefined` passes: Payload's default refuses an anonymous read, so a plugin
 * collection with no rule of its own is already closed. What must not happen is
 * `true`, or a query — a query is a successful read of some subset.
 */
export async function privateProblem(
  entity: AccessCheckedEntity,
): Promise<{ kind: AccessFindingKind; message: string } | undefined> {
  const answer = await anonymousRead(entity)
  if (answer === true) {
    return { kind: 'private-readable', message: `${entity.slug} is readable by anyone.` }
  }
  if (answer !== null && typeof answer === 'object') {
    return {
      kind: 'private-readable',
      message: `${entity.slug} answers an anonymous read with a query, so it succeeds for whatever matches.`,
    }
  }
  return undefined
}

/** Slugs of a bucket, whichever shape it was written in. */
export function bucketSlugs(
  bucket: Readonly<Record<string, string>> | readonly string[] | undefined,
): string[] {
  if (!bucket) return []
  return Array.isArray(bucket) ? [...(bucket as readonly string[])] : Object.keys(bucket)
}

/**
 * Every entity in exactly one bucket, and every bucket entry in the config.
 */
export function classificationFindings(
  entity: 'collection' | 'global',
  inConfig: readonly AccessCheckedEntity[],
  renderPath: readonly string[],
  closed: readonly string[],
): AccessFinding[] {
  const findings: AccessFinding[] = []
  const slugs = new Set(inConfig.map((item) => item.slug))
  const classified = [...renderPath, ...closed]

  const seen = new Set<string>()
  for (const slug of classified) {
    if (seen.has(slug)) {
      findings.push({
        entity,
        slug,
        kind: 'classified-twice',
        message: `${slug} is listed more than once. Each ${entity} belongs in exactly one bucket.`,
      })
    }
    seen.add(slug)
  }

  for (const slug of slugs) {
    if (!seen.has(slug)) {
      findings.push({
        entity,
        slug,
        kind: 'unclassified',
        message:
          `${slug} is in the config and in no bucket. Decide whether a published page reads it ` +
          `with nobody signed in (renderPath, with where) or the internet must not (private).`,
      })
    }
  }

  for (const slug of seen) {
    if (!slugs.has(slug)) {
      findings.push({
        entity,
        slug,
        kind: 'not-in-config',
        message: `${slug} is in a bucket and not in the config. Remove it, or fix the slug.`,
      })
    }
  }

  return findings
}

/** A Payload config, or the promise `buildConfig` returns. */
export type ConfigInput = AccessCheckedConfig | Promise<AccessCheckedConfig>

/**
 * Every finding for a config and its buckets, empty when it is sound.
 *
 * The pure form of `describeAnonymousAccess`, for a script or a test that
 * wants the list rather than one test per collection.
 */
export async function checkAnonymousAccess(
  config: ConfigInput,
  buckets: AnonymousAccessBuckets,
): Promise<AccessFinding[]> {
  const resolved = await config
  const findings: AccessFinding[] = []

  const sides: Array<{
    entity: 'collection' | 'global'
    items: readonly AccessCheckedEntity[]
    renderPath: string[]
    closed: string[]
  }> = [
    {
      entity: 'collection',
      items: resolved.collections ?? [],
      renderPath: bucketSlugs(buckets.renderPath),
      closed: bucketSlugs(buckets.private),
    },
  ]
  if (buckets.globals) {
    sides.push({
      entity: 'global',
      items: resolved.globals ?? [],
      renderPath: bucketSlugs(buckets.globals.renderPath),
      closed: bucketSlugs(buckets.globals.private),
    })
  }

  for (const side of sides) {
    findings.push(...classificationFindings(side.entity, side.items, side.renderPath, side.closed))
    const bySlug = new Map(side.items.map((item) => [item.slug, item]))

    for (const slug of side.renderPath) {
      const item = bySlug.get(slug)
      const problem = item && (await renderPathProblem(item))
      if (problem) findings.push({ entity: side.entity, slug, ...problem })
    }
    for (const slug of side.closed) {
      const item = bySlug.get(slug)
      const problem = item && (await privateProblem(item))
      if (problem) findings.push({ entity: side.entity, slug, ...problem })
    }
  }

  return findings
}
