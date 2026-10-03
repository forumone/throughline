import { describe, expect, it } from 'vitest'
import { loadOptionalPeer } from './optionalPeer.js'

describe('loadOptionalPeer', () => {
  it('names the feature and the install when the package is missing', async () => {
    const error = await loadOptionalPeer(
      'not-a-real-package-xyz',
      'Sending email',
      () =>
        // @ts-expect-error -- a package that does not exist, on purpose
        import('not-a-real-package-xyz'),
    ).catch((e: unknown) => e as Error)
    expect(error.message).toBe(
      'Sending email needs `not-a-real-package-xyz`, an optional peer of @forumone/throughline. Install it: pnpm add not-a-real-package-xyz',
    )
    expect(error.cause).toBeDefined()
  })

  it('passes any other failure through untouched', async () => {
    const original = new Error('the module threw while loading')
    await expect(
      loadOptionalPeer('resend', 'Sending email', () => Promise.reject(original)),
    ).rejects.toBe(original)
  })

  it('returns the module when it loads', async () => {
    await expect(
      loadOptionalPeer('zod', 'Validating', () => import('zod')),
    ).resolves.toHaveProperty('z')
  })
})
