import { failureOptions } from './types.js'
import type { InngestFunction } from 'inngest'
import type { RevalidateFn, RevalidateOnPublishOptions, RevalidatePathsInput } from './types.js'

const DEFAULT_URL_BUILDERS: Record<string, (slug: string) => string> = {
  pages: (slug) => (slug === 'home' || slug === '' ? '/' : `/${slug}`),
  posts: (slug) => `/blog/${slug}`,
}

/**
 * Builds the `revalidate-on-publish` Inngest function. Subscribes to the
 * publishing taxonomy and revalidates Next.js cache entries for the affected
 * page, the listing routes, and the sitemap.
 *
 * The default revalidate function dynamically imports `next/cache`, so the
 * package is safe to install in non-Next.js contexts. Pass `options.revalidate`
 * to use a different cache invalidation strategy.
 */
export function createRevalidateOnPublishFunction(
  options: RevalidateOnPublishOptions,
): InngestFunction.Any {
  const urlBuilders = { ...DEFAULT_URL_BUILDERS, ...options.urlBuilders }
  const collectionTags = options.collectionTags ?? {}
  const revalidate = options.revalidate ?? defaultRevalidate

  return options.inngest.createFunction(
    {
      id: options.id ?? 'revalidate-on-publish',
      retries: 5,
      /*
      No default cap. This is event-driven and idempotent — it drops cache tags
      and revalidates paths, and doing that twice is the same as doing it once —
      so two publishes landing together should not queue behind each other.
      */
      ...failureOptions(options),
      triggers: [
        { event: 'content/page.published' },
        { event: 'content/page.unpublished' },
        { event: 'content/page.rolled_back' },
      ],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as { collection?: string; slug?: string; id?: string }
      const collection = data.collection ?? 'pages'
      const slug = data.slug ?? data.id ?? ''
      const tags = collectionTags[collection] ?? [collection]

      await step.run('revalidate-page-path', async () => {
        const builder = urlBuilders[collection] ?? ((s: string) => `/${s}`)
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

/**
 * How stale a caller may find a tag after this runs: not at all.
 *
 * Next 16 made `revalidateTag`'s second argument required — it is a cache-life
 * profile — and one-argument calls log a deprecation warning on every publish.
 * `{ expire: 0 }` is the immediate expiry the one-argument form used to mean,
 * and it is what an editor pressing Publish expects.
 *
 * Passed unconditionally rather than behind a version check. The peer range is
 * `next >= 15`, and Next 15's `revalidateTag` takes one parameter and ignores a
 * second, so the two-argument call is correct on both.
 *
 * `updateTag`, which Next offers as the other way out of the deprecation, is
 * not usable here: it throws outside a Server Action, and this runs in an
 * Inngest step behind a route handler.
 */
const IMMEDIATE = { expire: 0 }

/**
 * Default revalidator: dynamic-imports `next/cache` so the package can be
 * imported in environments without Next.js (e.g. test runners that don't
 * stub the module). Calls `revalidatePath` only when `path` is non-empty
 * because `revalidatePath('')` triggers a noisy Next.js warning.
 */
const defaultRevalidate: RevalidateFn = async ({ path, tags }: RevalidatePathsInput) => {
  const { revalidatePath, revalidateTag } = (await import('next/cache')) as {
    revalidatePath: (path: string) => void
    revalidateTag: (tag: string, profile: string | { expire: number }) => void
  }
  if (path) revalidatePath(path)
  for (const tag of tags) revalidateTag(tag, IMMEDIATE)
}
