import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'
import { isDraftWrite } from '@forumone/throughline/publishing'
import { type CacheTags, defaultCacheTags } from './cache-tags.js'
import { IMMEDIATE, isOutsideNextRequest, loadNextCache } from './next-revalidate.js'

/*
Payload hooks that drop Next cache tags when content changes.

`createRevalidateOnPublishFunction` reacts to the publishing taxonomy, so it
sees publishes, unpublishes and rollbacks of publishable collections — and
nothing else. A global (navigation, footer, site settings) is read on every page
and usually cached, and nothing publishes it; a collection an integration writes
never emits a publishing event; a delete is not a publish. Without a hook, each
of those leaves the cached copy standing until the next deploy.

These are those hooks. They drop tags only; paths are the workflow's job.
*/

/** Drops one tag. Return a promise to have it awaited. */
export type RevalidateTagFn = (tag: string) => void | Promise<void>

export interface TagRevalidationOptions {
  /**
   * The tag scheme. Pass the same object your readers build their tags from —
   * that is the whole point of it. Default: `defaultCacheTags`.
   */
  cacheTags?: CacheTags
  /**
   * How to drop a tag. Default: Next's `revalidateTag(tag, { expire: 0 })`,
   * loaded from `next/cache` on first use. Supply your own for a non-Next
   * frontend or a CDN.
   */
  revalidateTag?: RevalidateTagFn
}

/** Which tags a hook drops, built from the scheme. */
export type TagSelector = (cacheTags: CacheTags, slug: string) => readonly string[]

export interface CollectionTagHookOptions {
  /**
   * The tags to drop. Default: the collection's own tag,
   * `cacheTags.collection(slug)`. Use it to drop a tag a *different* reader
   * owns — a navigation global that links to pages caches the pages' slugs:
   *
   * ```ts
   * tags: (t, slug) => [t.collection(slug), t.global('navigation')]
   * ```
   */
  tags?: TagSelector
  /**
   * Which `afterChange` operations drop. Default: both. An upload collection
   * can pass `['update']`: nothing can reference a document that did not exist
   * a moment ago, so creating one makes no cached page untrue.
   */
  operations?: ReadonlyArray<'create' | 'update'>
}

export interface GlobalTagHookOptions {
  /** The tags to drop. Default: the global's own tag, `cacheTags.global(slug)`. */
  tags?: TagSelector
}

export interface TagRevalidationHooks {
  /** `afterChange` for a collection. Skips draft writes. */
  afterCollectionChange(options?: CollectionTagHookOptions): CollectionAfterChangeHook
  /** `afterDelete` for a collection. */
  afterCollectionDelete(options?: Pick<CollectionTagHookOptions, 'tags'>): CollectionAfterDeleteHook
  /** `afterChange` for a global. */
  afterGlobalChange(options?: GlobalTagHookOptions): GlobalAfterChangeHook
}

/**
 * Builds the tag-revalidation hooks for one tag scheme.
 *
 * ```ts
 * import { createTagRevalidationHooks } from '@forumone/throughline-workflows'
 * import { cacheTags } from './lib/cache-tags'
 *
 * const revalidation = createTagRevalidationHooks({ cacheTags })
 *
 * const Pages: CollectionConfig = {
 *   slug: 'pages',
 *   hooks: {
 *     afterChange: [revalidation.afterCollectionChange()],
 *     afterDelete: [revalidation.afterCollectionDelete()],
 *   },
 *   ...
 * }
 * const Navigation: GlobalConfig = {
 *   slug: 'navigation',
 *   hooks: { afterChange: [revalidation.afterGlobalChange()] },
 *   ...
 * }
 * ```
 *
 * A hook never throws. Failing it would roll back the editor's save over a
 * cache miss. A failure is logged at `error` instead, and the one expected
 * failure — running outside a Next request, as seeds, migrations and the CLI
 * do — at `debug`.
 */
export function createTagRevalidationHooks(
  options: TagRevalidationOptions = {},
): TagRevalidationHooks {
  const cacheTags = options.cacheTags ?? defaultCacheTags
  const revalidateTag = options.revalidateTag ?? nextRevalidateTag

  async function drop(tags: readonly string[], req: PayloadRequest): Promise<void> {
    for (const tag of new Set(tags)) {
      try {
        await revalidateTag(tag)
      } catch (error) {
        /*
        Outside Next there is no server to be stale, so that one is noise.
        Anything else means the cache did *not* clear while a server was
        running — a real fault, so it is logged loudly. It is still not
        thrown: an `afterChange` that throws fails the editor's save.
        */
        if (isOutsideNextRequest(error)) {
          req.payload.logger.debug(
            { tag },
            'Skipped cache revalidation: not inside a Next request.',
          )
        } else {
          req.payload.logger.error(
            { err: error, tag },
            'Failed to revalidate a cache tag; the cached copy is stale.',
          )
        }
      }
    }
  }

  return {
    afterCollectionChange(hookOptions = {}) {
      const select = hookOptions.tags ?? ((t, slug) => [t.collection(slug)])
      const operations = new Set(hookOptions.operations ?? ['create', 'update'])

      return async ({ collection, doc, operation, req }) => {
        if (!operations.has(operation)) return doc
        if (isUnpublishedWrite(req, collection.slug, doc, operation)) return doc
        await drop(select(cacheTags, collection.slug), req)
        return doc
      }
    },

    afterCollectionDelete(hookOptions = {}) {
      const select = hookOptions.tags ?? ((t, slug) => [t.collection(slug)])
      return async ({ collection, doc, req }) => {
        await drop(select(cacheTags, collection.slug), req)
        return doc
      }
    },

    afterGlobalChange(hookOptions = {}) {
      const select = hookOptions.tags ?? ((t, slug) => [t.global(slug)])
      return async ({ doc, global, req }) => {
        await drop(select(cacheTags, global.slug), req)
        return doc
      }
    },
  }
}

/*
A write the public cannot see changes nothing cached, so there is nothing to
drop — and with autosave on, "a draft save" is every few seconds of an open
editor. Without this, one editing session evicts the tag over and over and every
request in between pays a cold read for content that did not change.

`isDraftWrite` is publishing's own predicate, the one its trust boundary uses.
An `afterChange` hook cannot answer this for itself: Payload sets
`data._status = 'draft'` on any `draft: true` update before hooks run, and
`previousDoc` is the latest *version*, so a draft save of a published document
and an unpublish of it look the same from in here. The publishing plugin records
the operation's real `draft` argument in `beforeOperation`. That is recorded for
the collections the plugin manages; on any other collection `isDraftWrite` is
false and the hook drops, which is the safe direction.

An unpublish is not a draft write and still drops — it is the case that would
otherwise leave a cached link pointing at a 404.

A *create* that lands as a draft is unambiguous on its own: nothing published
existed a moment ago, so nothing cached can be about it.
*/
function isUnpublishedWrite(
  req: PayloadRequest,
  collectionSlug: string,
  doc: { id?: unknown; _status?: unknown } | undefined,
  operation: 'create' | 'update',
): boolean {
  if (operation === 'create') return doc?._status === 'draft'
  return isDraftWrite(req, collectionSlug, doc?.id)
}

async function nextRevalidateTag(tag: string): Promise<void> {
  const { revalidateTag } = await loadNextCache()
  revalidateTag(tag, IMMEDIATE)
}
