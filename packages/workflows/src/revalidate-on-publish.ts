import { failureOptions } from './types.js'
import type { InngestFunction } from 'inngest'
import { defineJob } from './jobs/define.js'
import { inngestJobs } from './jobs/inngest.js'
import type { JobOptions } from './jobs/options.js'
import type { Job } from './jobs/types.js'
import { defaultCacheTags } from './cache-tags.js'
import { IMMEDIATE, loadNextCache } from './next-revalidate.js'
import type { RevalidateFn, RevalidateOnPublishOptions, RevalidatePathsInput } from './types.js'

/**
 * Builds the `revalidate-on-publish` Inngest function. Subscribes to the
 * publishing taxonomy and revalidates Next.js cache entries for the affected
 * page, the listing routes, and the sitemap.
 *
 * The page path comes from `options.urlBuilders`, which is required: only the
 * site knows where a collection's documents are served. A collection with no
 * builder gets its tags dropped and no path revalidated, with a warning —
 * there used to be built-in builders (`pages` → `/<slug>`, `posts` →
 * `/blog/<slug>`, anything else → `/<slug>`), and a site whose routes differed
 * revalidated the wrong path without a word.
 *
 * Tags default to `cacheTags.collection(<collection>)`. Pass the same
 * `cacheTags` your readers and your tag hooks use.
 *
 * The default revalidate function dynamically imports `next/cache`, so the
 * package is safe to install in non-Next.js contexts. Pass `options.revalidate`
 * to use a different cache invalidation strategy.
 */
export function revalidateOnPublishJob(options: JobOptions<RevalidateOnPublishOptions>): Job {
  const urlBuilders = options.urlBuilders
  const cacheTags = options.cacheTags ?? defaultCacheTags
  const collectionTags = options.collectionTags ?? {}
  const revalidate = options.revalidate ?? defaultRevalidate

  return defineJob(
    {
      id: options.id ?? 'revalidate-on-publish',
      retries: 5,
      /*
      No default cap. This is event-driven and idempotent — it drops cache tags
      and revalidates paths, and doing that twice is the same as doing it once —
      so two publishes landing together should not queue behind each other.
      */
      ...failureOptions(options),
      on: {
        event: ['content/page.published', 'content/page.unpublished', 'content/page.rolled_back'],
      },
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as { collection?: string; slug?: string; id?: string }
      const collection = data.collection ?? 'pages'
      const slug = data.slug ?? data.id ?? ''
      const tags = collectionTags[collection] ?? [cacheTags.collection(collection)]

      await step.run('revalidate-page-path', async () => {
        const builder = Object.hasOwn(urlBuilders, collection) ? urlBuilders[collection] : undefined
        if (!builder) {
          logger.warn(
            'No urlBuilders entry for this collection, so no page path was revalidated. Add one to createRevalidateOnPublishFunction.',
            { collection, slug },
          )
          return
        }
        const path = builder(slug)
        await revalidate({ path, tags })
        logger.info('Revalidated page path', { path, tags })
      })

      await step.run('revalidate-listings', async () => {
        await revalidate({ path: '', tags })
      })

      await step.run('revalidate-sitemap', async () => {
        await revalidate({ path: '/sitemap.xml', tags: ['sitemap'] })
      })

      return { collection, slug, revalidated: true }
    },
  )
}

/** The same job, registered with Inngest exactly as it always was. */
export function createRevalidateOnPublishFunction(
  options: RevalidateOnPublishOptions,
): InngestFunction.Any {
  return inngestJobs(options.inngest).toFunction(revalidateOnPublishJob(options))
}

/**
 * Default revalidator: dynamic-imports `next/cache` so the package can be
 * imported in environments without Next.js (e.g. test runners that don't
 * stub the module). Calls `revalidatePath` only when `path` is non-empty
 * because `revalidatePath('')` triggers a noisy Next.js warning.
 */
const defaultRevalidate: RevalidateFn = async ({ path, tags }: RevalidatePathsInput) => {
  const { revalidatePath, revalidateTag } = await loadNextCache()
  if (path) revalidatePath(path)
  for (const tag of tags) revalidateTag(tag, IMMEDIATE)
}
