import type { Payload } from 'payload'
import type {
  AuthenticatedUser,
  McpAuthResult,
  McpAuthenticator,
} from '@forumone/throughline-plugin-contract'
import { DEFAULT_API_KEYS_SLUG, sha256Hex } from './api-keys.js'

export interface BearerTokenAuthenticatorOptions {
  payload: Payload
  /** Slug for the API-keys collection. Default: `'mcp-api-keys'`. */
  collectionSlug?: string
}

/**
 * Authenticates incoming MCP requests by looking up the bearer token's hash
 * against the API-keys collection. Returns the linked user plus key metadata
 * on success, `null` on any failure (no token, unknown token, disabled key,
 * key without linked user, expired key).
 */
export function createBearerTokenAuthenticator(
  options: BearerTokenAuthenticatorOptions,
): McpAuthenticator {
  const { payload, collectionSlug = DEFAULT_API_KEYS_SLUG } = options

  return {
    async authenticate(request: Request): Promise<McpAuthResult | null> {
      const token = extractBearerToken(request)
      if (!token) return null

      const hash = await sha256Hex(token)

      const result = await payload.find({
        collection: collectionSlug,
        where: {
          and: [{ keyHash: { equals: hash } }, { enabled: { equals: true } }],
        },
        limit: 1,
        depth: 1,
      })

      const apiKey = result.docs[0]
      if (!apiKey) return null

      const expiresAt = apiKey['expiresAt']
      if (typeof expiresAt === 'string' && Date.parse(expiresAt) <= Date.now()) {
        return null
      }

      const linkedUser = apiKey['linkedUser']
      if (!linkedUser || typeof linkedUser !== 'object') return null

      const user = toAuthenticatedUser(linkedUser as Record<string, unknown>)
      if (!user) return null

      return {
        user,
        apiKeyName: String(apiKey['name'] ?? ''),
        apiKeyId: String(apiKey['id']),
      }
    },
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

function toAuthenticatedUser(raw: Record<string, unknown>): AuthenticatedUser | null {
  if (raw['id'] === undefined || raw['email'] === undefined) return null
  return {
    id: String(raw['id']),
    email: String(raw['email']),
    name: String(raw['name'] ?? raw['email']),
    roles: (raw['roles'] as string[] | undefined) ?? [],
    groups: (raw['groups'] as string[] | undefined) ?? [],
  }
}
