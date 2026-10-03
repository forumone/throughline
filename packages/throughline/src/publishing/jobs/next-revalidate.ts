import type * as NextCacheModule from 'next/cache'

type NextCache = typeof NextCacheModule

/**
 * How stale a caller may find a tag after it is dropped: not at all.
 *
 * Next 16 made `revalidateTag`'s second argument required — it is a cache-life
 * profile — and one-argument calls log a deprecation warning on every call.
 * `{ expire: 0 }` is the immediate expiry the one-argument form used to mean,
 * and it is what an editor pressing Publish or Save expects.
 *
 * Passed unconditionally rather than behind a version check. The peer range is
 * `next >= 15`, and Next 15's `revalidateTag` takes one parameter and ignores a
 * second, so the two-argument call is correct on both.
 *
 * `updateTag`, which Next offers as the other way out of the deprecation, is
 * not usable here: it throws outside a Server Action, and these run in an
 * Inngest step or in Payload's route handler.
 */
export const IMMEDIATE = { expire: 0 } as const

/**
 * `next/cache`, loaded on first use.
 *
 * Dynamic so the package can be imported where Next is not installed (test
 * runners, a non-Next frontend that passes its own revalidator). `next` is an
 * optional peer.
 */
export async function loadNextCache(): Promise<NextCache> {
  return await import('next/cache')
}

/**
 * Whether `error` is Next saying there is no request to revalidate for.
 *
 * Seeds, migrations and the Payload CLI write through the same hooks under
 * `tsx` rather than inside a Next server. `revalidateTag` then throws
 * `Invariant: static generation store missing in revalidateTag ...`. Nothing is
 * stale in that case — there is no server to be stale — so it is the one
 * failure that is not a fault.
 *
 * Matched on the message, the only stable surface Next gives it.
 */
export function isOutsideNextRequest(error: unknown): boolean {
  return error instanceof Error && error.message.includes('static generation store missing')
}
