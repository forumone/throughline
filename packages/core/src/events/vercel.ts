import type { InngestFunction } from 'inngest'

/*
Inngest on Vercel: one environment per kind of deployment, and no crons in
previews.

Moved here from forumone-2026 (`apps/web/src/lib/inngest.ts`), where it was
#627. Every Vercel site has the same problem:

- **One environment per branch.** Left alone, the SDK takes its environment
  name from the first of `INNGEST_ENV`, `BRANCH_NAME`, `VERCEL_GIT_COMMIT_REF`,
  … that is set, and Inngest creates a branch environment for each distinct
  name. Each one carries a full copy of the app's functions, crons included.
  forumone-2026 measured thirty-one preview branches each running every cron
  against the one shared preview database: ~166k invocations a month against a
  50,000 free tier.
- **Production named after a branch.** The SDK declares `VERCEL_ENV` and never
  reads it, so a production deployment announced itself as an environment
  named after whatever branch it deploys from.

`resolveInngestEnv` returns one name per kind of deployment, and
`registrableInngestFunctions` drops the cron-only functions where that name is
`preview`.
*/

type Env = Readonly<Record<string, string | undefined>>

/**
 * The Inngest environment for this deployment, for `createInngestClient`'s
 * `env`: `production` on Vercel production, `preview` for every Vercel preview,
 * and `undefined` everywhere else.
 *
 * - **An explicit `INNGEST_ENV` wins.** This returns `undefined`, and the SDK
 *   reads the variable itself. An empty one counts as unset, because Vercel
 *   stores an unset variable as an empty string.
 * - **`NODE_ENV` gates the whole thing.** `vercel env pull` writes a
 *   `.env.local` that carries `VERCEL_ENV="preview"`, so a laptop would
 *   otherwise sync into the environment every preview shares. `next dev` is
 *   still `NODE_ENV=development`.
 * - **Anything else**, Vercel's `development` included, returns `undefined`
 *   and leaves the SDK to its own discovery.
 *
 * @example
 * ```ts
 * const env = resolveInngestEnv()
 * export const inngest = createInngestClient({ id: 'my-site', ...(env ? { env } : {}) })
 * ```
 */
export function resolveInngestEnv(env: Env = process.env): string | undefined {
  if (env['INNGEST_ENV']) return undefined
  if (env['NODE_ENV'] !== 'production') return undefined

  switch (env['VERCEL_ENV']) {
    case 'production':
      return 'production'
    case 'preview':
      return 'preview'
    default:
      return undefined
  }
}

/**
 * Whether this deployment should register cron-triggered functions: everywhere
 * except a Vercel preview.
 *
 * A preview is a branch somebody is reviewing, and every cron a site has exists
 * to keep a published site current. What a preview loses is each a thing done
 * on demand rather than a thing that stops quietly: an integration's manual
 * sync is an event, and stays.
 */
export function registersInngestCrons(env: Env = process.env): boolean {
  return resolveInngestEnv(env) !== 'preview'
}

/**
 * The functions to hand `serve()`, without the cron-only ones where
 * `registersInngestCrons` says no.
 *
 * Cron-*only*: a function triggered by a cron and an event keeps its event in
 * a preview, since dropping it would take a manual sync with it, silently. It
 * filters built functions by their public `opts.triggers`, so it covers jobs
 * from `inngestJobs` and hand-written `createFunction`s alike, with no second
 * list of ids to keep in step.
 */
export function registrableInngestFunctions<T extends InngestFunction.Any>(
  functions: readonly T[],
  env: Env = process.env,
): T[] {
  if (registersInngestCrons(env)) return [...functions]

  const isCron = (trigger: unknown): boolean =>
    typeof trigger === 'object' && trigger !== null && 'cron' in trigger

  return functions.filter((fn) => {
    // Through `unknown`: `opts` on `InngestFunction.Any` widens to `any`.
    const { triggers } = fn.opts as unknown as { triggers?: readonly unknown[] }
    // `length > 0`, because `every` on an empty array is true.
    return !(triggers !== undefined && triggers.length > 0 && triggers.every(isCron))
  })
}
