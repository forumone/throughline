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
 * Default revalidator: dynamic-imports `next/cache` so the package can be
 * imported in environments without Next.js (e.g. test runners that don't
 * stub the module). Calls `revalidatePath` only when `path` is non-empty
 * because `revalidatePath('')` triggers a noisy Next.js warning.
 */
const defaultRevalidate: RevalidateFn = async ({ path, tags }: RevalidatePathsInput) => {
  const { revalidatePath, revalidateTag } = (await import('next/cache')) as {
    revalidatePath: (path: string) => void
    revalidateTag: (tag: string) => void
  }
  if (path) revalidatePath(path)
  for (const tag of tags) revalidateTag(tag)
}
