import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRevalidateOnPublishFunction } from './revalidate-on-publish.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

/*
The revalidator nobody was testing.

Every case in `revalidate-on-publish.test.ts` passes its own `revalidate`, which
is the right way to assert *what* gets revalidated but means the built-in — the
only one production runs — had no coverage at all. That is how a one-argument
`revalidateTag` survived Next 16 making the second argument required: the call
is behind a dynamic import and a cast, so neither the compiler nor a test could
see it. It warned on every publish rather than failing, which is the quietest
possible way to be wrong.

So these assert the shape of the call into `next/cache`, not the routing.
*/

const revalidatePath = vi.fn()
const revalidateTag = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}))

async function publish(data: Record<string, unknown>) {
  const fakeInngest = createFakeInngest()
  createRevalidateOnPublishFunction({
    inngest: fakeInngest.inngest,
    payload: createFakePayload().payload,
  })
  await fakeInngest.invoke('revalidate-on-publish', { name: 'content/page.published', data })
}

describe('the built-in revalidator', () => {
  beforeEach(() => {
    revalidatePath.mockClear()
    revalidateTag.mockClear()
  })

  /*
  The regression this file exists for. A single argument still works on Next 16
  — it warns and expires immediately — so nothing observable broke, and nothing
  would have until Next 17 removed the fallback.
  */
  it('gives revalidateTag the cache-life profile Next 16 requires', async () => {
    await publish({ collection: 'pages', slug: 'about' })

    expect(revalidateTag).toHaveBeenCalled()
    for (const call of revalidateTag.mock.calls) {
      expect(call).toHaveLength(2)
      expect(call[1]).toEqual({ expire: 0 })
    }
  })

  it('revalidates the page path and the sitemap, and every tag it is given', async () => {
    await publish({ collection: 'posts', slug: 'a-post' })

    expect(revalidatePath.mock.calls.map(c => c[0])).toEqual(['/blog/a-post', '/sitemap.xml'])
    expect(revalidateTag.mock.calls.map(c => c[0])).toEqual(['posts', 'posts', 'sitemap'])
  })

  /*
  `revalidatePath('')` is what the listings step passes, and Next warns on it.
  The guard predates this file; it is asserted here because the mock is the only
  place the empty path is visible.
  */
  it('skips revalidatePath for the listings step, which has no path', async () => {
    await publish({ collection: 'pages', slug: 'about' })

    expect(revalidatePath).not.toHaveBeenCalledWith('')
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })
})
