import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_KEYS_SLUG,
  createApiKeysCollection,
  generateApiKey,
  sha256Hex,
} from './api-keys.js'

describe('createApiKeysCollection', () => {
  it('uses the default slug', () => {
    expect(createApiKeysCollection().slug).toBe(DEFAULT_API_KEYS_SLUG)
  })

  it('locks all access to admin role only', () => {
    const config = createApiKeysCollection()
    const access = config.access ?? {}
    const admin = { req: { user: { roles: ['admin'] } } } as never
    const editor = { req: { user: { roles: ['editor'] } } } as never
    expect((access.read as (a: unknown) => boolean)(admin)).toBe(true)
    expect((access.read as (a: unknown) => boolean)(editor)).toBe(false)
    expect((access.create as (a: unknown) => boolean)(editor)).toBe(false)
    expect((access.delete as (a: unknown) => boolean)(editor)).toBe(false)
  })

  it('hashes a generated key on create and surfaces the raw value as __rawKey', async () => {
    const config = createApiKeysCollection()
    const beforeChange = config.hooks?.beforeChange?.[0]
    if (!beforeChange) throw new Error('expected beforeChange hook')

    const data: Record<string, unknown> = { name: 'CI key', linkedUser: 'u1', scopes: ['content.read'] }
    const result = (await beforeChange({
      data,
      operation: 'create',
    } as Parameters<typeof beforeChange>[0])) as Record<string, unknown>

    expect(typeof result['keyHash']).toBe('string')
    expect((result['keyHash'] as string).length).toBe(64)
    expect(typeof result['keyDisplay']).toBe('string')
    const raw = result['__rawKey'] as string
    expect(raw).toMatch(/^tl_[0-9a-f]{64}$/)
    expect(await sha256Hex(raw)).toBe(result['keyHash'])
  })

  it('does not regenerate keyHash on update', async () => {
    const config = createApiKeysCollection()
    const beforeChange = config.hooks?.beforeChange?.[0]
    if (!beforeChange) throw new Error('expected beforeChange hook')

    const data: Record<string, unknown> = { name: 'CI key', keyHash: 'preset' }
    const result = (await beforeChange({
      data,
      operation: 'update',
    } as Parameters<typeof beforeChange>[0])) as Record<string, unknown>

    expect(result['keyHash']).toBe('preset')
    expect(result['__rawKey']).toBeUndefined()
  })

  it('honors a custom usersSlug for the relationship target', () => {
    const config = createApiKeysCollection({ usersSlug: 'editors' })
    const linkedUser = config.fields.find((f) => 'name' in f && f.name === 'linkedUser')
    expect(linkedUser).toMatchObject({ relationTo: 'editors' })
  })

  it('honors custom available scopes', () => {
    const config = createApiKeysCollection({ availableScopes: ['only.this'] })
    const scopes = config.fields.find((f) => 'name' in f && f.name === 'scopes') as {
      options: { value: string }[]
    }
    expect(scopes.options.map((o) => o.value)).toEqual(['only.this'])
  })
})

describe('generateApiKey / sha256Hex', () => {
  it('generates 32-byte hex tokens prefixed with tl_', () => {
    const key = generateApiKey()
    expect(key).toMatch(/^tl_[0-9a-f]{64}$/)
  })

  it('produces stable SHA-256 hex digests', async () => {
    const a = await sha256Hex('hello')
    const b = await sha256Hex('hello')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
