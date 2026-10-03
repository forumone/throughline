/*
Next cache tags, named in one place.

A tag is one string with two ends: the reader that caches under it
(`unstable_cache(..., { tags })`, `cacheTag()`, `fetch(..., { next: { tags } })`)
and the writer that drops it (the hooks in `revalidate-tag-hooks.ts`, and
`revalidateOnPublishJob`). Nothing in the type system connects the two
ends. Name them differently and everything compiles, every test passes, the hook
runs, and the page never refreshes — the first site on this suite shipped a hook
that had never invalidated anything for exactly that reason.

So both ends build tags from one object. A site makes it once, in a module its
`payload.config.ts` and its frontend both import, and hands it to the hooks and
the readers alike.

Deliberately dependency-free, and published on its own subpath
(`@forumone/throughline/cache-tags`): one of its importers is
`payload.config.ts` and the other is frontend code, and neither should pull in
the other's world to name a string.
*/

/** How a site names its tags. Each builder is optional; omitted ones use the default. */
export interface CacheTagScheme {
  /**
   * The tag for cached reads derived from a collection's documents.
   * Default: the bare slug (`pages`), which is also what
   * `revalidateOnPublishJob` has always fired.
   */
  collection?: (slug: string) => string
  /** The tag for a cached global. Default: `global_<slug>`. */
  global?: (slug: string) => string
}

/** The built scheme. Pass the same instance to writers and readers. */
export interface CacheTags {
  collection(slug: string): string
  global(slug: string): string
}

/**
 * Builds the tag scheme both ends of the cache use.
 *
 * ```ts
 * // src/lib/cache-tags.ts — imported by payload.config.ts and by readers
 * export const cacheTags = createCacheTags()
 *
 * // a reader
 * unstable_cache(load, ['navigation'], { tags: [cacheTags.global('navigation')] })
 * ```
 */
export function createCacheTags(scheme: CacheTagScheme = {}): CacheTags {
  const collection = scheme.collection ?? ((slug: string) => slug)
  const global = scheme.global ?? ((slug: string) => `global_${slug}`)
  return {
    collection: (slug) => nonEmpty(collection(slug), 'collection', slug),
    global: (slug) => nonEmpty(global(slug), 'global', slug),
  }
}

/** The scheme every writer uses when it is given none. */
export const defaultCacheTags: CacheTags = createCacheTags()

/*
An empty tag is the silent version of the mismatch above: `revalidateTag('')`
does nothing and says nothing. A builder that produces one is a bug in the
site's configuration, and the place to hear about it is the first call.
*/
function nonEmpty(tag: string, kind: string, slug: string): string {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error(`The cache tag scheme built an empty ${kind} tag for "${slug}".`)
  }
  return tag
}
