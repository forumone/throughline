import type { InngestFunction } from 'inngest'
import { describe, expect, it } from 'vitest'
import { registersInngestCrons, registrableInngestFunctions, resolveInngestEnv } from './vercel.js'

/*
Ported from forumone-2026 with the code. A regression here is silent: nothing
fails, and the Inngest bill multiplies by the number of open pull requests.
*/
describe('resolveInngestEnv', () => {
  it('collapses every preview deployment into one environment', () => {
    // Not the branch: two previews of two branches return the same name.
    for (const ref of ['fix/a', 'feat/b']) {
      expect(
        resolveInngestEnv({
          NODE_ENV: 'production',
          VERCEL_ENV: 'preview',
          VERCEL_GIT_COMMIT_REF: ref,
        }),
      ).toBe('preview')
    }
  })

  it('names production, rather than letting it fall through to its branch', () => {
    expect(
      resolveInngestEnv({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        VERCEL_GIT_COMMIT_REF: 'live',
      }),
    ).toBe('production')
  })

  it('defers to an explicit INNGEST_ENV', () => {
    const base = { NODE_ENV: 'production', INNGEST_ENV: 'staging' }
    expect(resolveInngestEnv({ ...base, VERCEL_ENV: 'preview' })).toBeUndefined()
    expect(resolveInngestEnv({ ...base, VERCEL_ENV: 'production' })).toBeUndefined()
  })

  it('treats an empty INNGEST_ENV as unset', () => {
    expect(
      resolveInngestEnv({ NODE_ENV: 'production', INNGEST_ENV: '', VERCEL_ENV: 'preview' }),
    ).toBe('preview')
  })

  it('leaves local dev alone, even when the env file impersonates Vercel', () => {
    // `vercel env pull` writes VERCEL="1" and VERCEL_ENV="preview" into .env.local.
    expect(
      resolveInngestEnv({ NODE_ENV: 'development', VERCEL: '1', VERCEL_ENV: 'preview' }),
    ).toBeUndefined()
    expect(resolveInngestEnv({})).toBeUndefined()
    expect(resolveInngestEnv({ NODE_ENV: 'production', VERCEL_ENV: 'development' })).toBeUndefined()
    expect(
      resolveInngestEnv({ NODE_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'fix/a' }),
    ).toBeUndefined()
  })
})

const fn = (id: string, triggers: unknown[]): InngestFunction.Any =>
  ({ opts: { id, triggers } }) as unknown as InngestFunction.Any

const ids = (functions: InngestFunction.Any[]): string[] =>
  functions.map((f) => (f.opts as { id: string }).id)

const CRON = fn('jobs-sync', [{ cron: '17 * * * *' }])
const EVENT = fn('manual-sync', [{ event: 'integration/manual-sync' }])
const BOTH = fn('both', [{ cron: '0 * * * *' }, { event: 'content/page.published' }])
const NEITHER = fn('no-triggers', [])

describe('registrableInngestFunctions', () => {
  const PREVIEW = { NODE_ENV: 'production', VERCEL_ENV: 'preview' }
  const PRODUCTION = { NODE_ENV: 'production', VERCEL_ENV: 'production' }

  it('drops the cron-only functions in a preview', () => {
    expect(ids(registrableInngestFunctions([CRON, EVENT], PREVIEW))).toEqual(['manual-sync'])
  })

  it('keeps a function that is triggered by an event as well', () => {
    expect(ids(registrableInngestFunctions([BOTH], PREVIEW))).toEqual(['both'])
  })

  it('keeps a function with no triggers at all', () => {
    expect(ids(registrableInngestFunctions([NEITHER], PREVIEW))).toEqual(['no-triggers'])
  })

  it('registers everything in production and locally', () => {
    const all = [CRON, EVENT, BOTH, NEITHER]
    expect(registrableInngestFunctions(all, PRODUCTION)).toEqual(all)
    expect(registrableInngestFunctions(all, { NODE_ENV: 'development' })).toEqual(all)
    expect(registrableInngestFunctions(all, {})).toEqual(all)
  })

  it('agrees with registersInngestCrons', () => {
    expect(registersInngestCrons(PREVIEW)).toBe(false)
    expect(registersInngestCrons(PRODUCTION)).toBe(true)
    expect(registersInngestCrons({ NODE_ENV: 'development' })).toBe(true)
    // An explicit INNGEST_ENV opts out of the whole resolution, crons included.
    expect(registersInngestCrons({ ...PREVIEW, INNGEST_ENV: 'staging' })).toBe(true)
  })
})
