/*
Next cache tags, named in one place.

A tag has two ends: a reader that caches under it and a hook that drops it.
Nothing checks that they match, so both build their tags from this object —
`payload.config.ts` hands it to the revalidation hooks, the Inngest route hands
it to `createRevalidateOnPublishFunction`, and frontend code that caches a read
tags it from here too:

    import { unstable_cache } from 'next/cache'
    import { cacheTags } from '@/lib/cache-tags'

    const getNavigation = unstable_cache(loadNavigation, ['navigation'], {
      tags: [cacheTags.global('navigation')],
    })

Change the scheme here and every end moves with it. Imported from the
package's `/cache-tags` subpath, which imports nothing, so frontend code that
uses it does not pull in Payload.
*/
import { createCacheTags } from '@forumone/throughline-workflows/cache-tags'

export const cacheTags = createCacheTags()
