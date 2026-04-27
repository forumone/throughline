import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createBearerTokenAuthenticator } from './authenticator.js'
import { sha256Hex } from './api-keys.js'

function makePayload(docs: unknown[]) {
  const find = vi.fn(async () => ({ docs, totalDocs: docs.length }))
  return { find, payload: { find } as unknown as Payload }
}

const goodApiKey = {
  id: 'k1',
  name: 'CI key',
  enabled: true,
  linkedUser: {
    id: 'u1',
    email: 'ci@example.com',
    name: 'CI Bot',
    roles: ['publisher'],
    groups: ['editorial'],
  },
}

function bearer(token: string): Request {
  return new Request('http://example.com/api', {
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('createBearerTokenAuthenticator', () => {
  it('returns null when no Authorization header is present', async () => {
    const { payload } = makePayload([])
    const auth = createBearerTokenAuthenticator({ payload })
    const result = await auth.authenticate(new Request('http://example.com/api'))
    expect(result).toBeNull()
  })

  it('returns null when the header is malformed', async () => {
    const { payload } = makePayload([])
    const auth = createBearerTokenAuthenticator({ payload })
    const request = new Request('http://example.com/api', {
      headers: { authorization: 'Basic abc' },
    })
    expect(await auth.authenticate(request)).toBeNull()
  })

  it('returns the linked user when the hashed key matches an enabled record', async () => {
    const { find, payload } = makePayload([goodApiKey])
    const auth = createBearerTokenAuthenticator({ payload })
    const result = await auth.authenticate(bearer('raw-token-x'))

    expect(result).not.toBeNull()
    expect(result?.user.email).toBe('ci@example.com')
    expect(result?.user.roles).toEqual(['publisher'])
    expect(result?.apiKeyId).toBe('k1')
    expect(result?.apiKeyName).toBe('CI key')

    const findArgs = find.mock.calls[0]?.[0] as { where: { and: { keyHash: { equals: string } }[] } }
    expect(findArgs.where.and[0]?.keyHash.equals).toBe(await sha256Hex('raw-token-x'))
  })

  it('returns null when no matching key is found', async () => {
    const { payload } = makePayload([])
    const auth = createBearerTokenAuthenticator({ payload })
    expect(await auth.authenticate(bearer('nope'))).toBeNull()
  })

  it('returns null when the linked user is missing', async () => {
    const { payload } = makePayload([{ ...goodApiKey, linkedUser: null }])
    const auth = createBearerTokenAuthenticator({ payload })
    expect(await auth.authenticate(bearer('x'))).toBeNull()
  })

  it('returns null when the key has expired', async () => {
    const expired = { ...goodApiKey, expiresAt: new Date(Date.now() - 1000).toISOString() }
    const { payload } = makePayload([expired])
    const auth = createBearerTokenAuthenticator({ payload })
    expect(await auth.authenticate(bearer('x'))).toBeNull()
  })

  it('passes through when expiresAt is in the future', async () => {
    const future = { ...goodApiKey, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    const { payload } = makePayload([future])
    const auth = createBearerTokenAuthenticator({ payload })
    expect(await auth.authenticate(bearer('x'))).not.toBeNull()
  })

  it('honors a custom collection slug', async () => {
    const { find, payload } = makePayload([goodApiKey])
    const auth = createBearerTokenAuthenticator({ payload, collectionSlug: 'my-keys' })
    await auth.authenticate(bearer('x'))
    const findArgs = find.mock.calls[0]?.[0] as { collection: string }
    expect(findArgs.collection).toBe('my-keys')
  })
})
