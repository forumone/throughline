import { describe, expect, it, vi } from 'vitest'
import type { GlobalAfterChangeHook } from 'payload'
import { createTagRevalidationHooks } from './revalidate-tag-hooks.js'

/*
Against the real `next/cache`, unmocked.

The hooks recognise "not inside a Next request" by the message of the error
Next throws. The mocked tests next door assert what happens given that message;
this asserts that the installed Next still throws it, so a Next upgrade that
rewords the invariant fails here rather than turning every seed run into a
wall of error logs.
*/
describe('outside a Next request, with the real next/cache', () => {
  it('logs at debug, not error, and does not throw', async () => {
    const logger = { debug: vi.fn(), error: vi.fn() }
    const hook = createTagRevalidationHooks().afterGlobalChange() as (
      args: unknown,
    ) => ReturnType<GlobalAfterChangeHook>

    await expect(
      hook({ global: { slug: 'navigation' }, doc: { ok: true }, req: { payload: { logger } } }),
    ).resolves.toEqual({ ok: true })

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledTimes(1)
  })
})
