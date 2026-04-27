import type { Access, CollectionConfig } from 'payload'

export interface ApiKeysCollectionOptions {
  /** Override the collection slug. Default: `'mcp-api-keys'`. */
  slug?: string
  /** Slug of the users collection the key links to. Default: `'users'`. */
  usersSlug?: string
  /** Allowed scope strings shown in the admin UI. */
  availableScopes?: string[]
}

export const DEFAULT_API_KEYS_SLUG = 'mcp-api-keys'

const DEFAULT_SCOPES = [
  'content.read',
  'content.write',
  'design.read',
  'publishing.execute',
  'approvals.request',
  'approvals.decide',
  'forms.manage',
  'integrations.trigger',
  'audit.read',
] as const

/**
 * Returns true when the requesting user has the `admin` role. Used as the
 * default access check for the keys collection — keys grant capability,
 * so creating/reading them must be tightly scoped.
 */
const adminOnly: Access = ({ req }) => {
  const roles = (req.user?.['roles'] as string[] | undefined) ?? []
  return roles.includes('admin')
}

/**
 * Builds the API-keys collection config. Stores keys as SHA-256 hashes;
 * raw keys are surfaced one-time via the `keyDisplay` field on create
 * so the admin UI can show them to the operator.
 */
export function createApiKeysCollection(
  options: ApiKeysCollectionOptions = {},
): CollectionConfig {
  const slug = options.slug ?? DEFAULT_API_KEYS_SLUG
  const usersSlug = options.usersSlug ?? 'users'
  const availableScopes = options.availableScopes ?? [...DEFAULT_SCOPES]

  return {
    slug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'linkedUser', 'enabled', 'lastUsedAt'],
      description:
        'API keys for MCP clients. Each key inherits the linked user\'s access control; keys are stored as SHA-256 hashes.',
    },
    access: {
      read: adminOnly,
      create: adminOnly,
      update: adminOnly,
      delete: adminOnly,
    },
    fields: [
      { name: 'name', type: 'text', required: true },
      {
        name: 'linkedUser',
        type: 'relationship',
        relationTo: usersSlug,
        required: true,
        admin: { description: 'The user whose access control this key inherits.' },
      },
      {
        name: 'scopes',
        type: 'select',
        hasMany: true,
        required: true,
        options: availableScopes.map((value) => ({ label: value, value })),
      },
      { name: 'enabled', type: 'checkbox', defaultValue: true, required: true },
      {
        name: 'keyHash',
        type: 'text',
        required: true,
        admin: {
          readOnly: true,
          description: 'SHA-256 hash of the key. The raw key is never stored.',
        },
      },
      {
        name: 'keyDisplay',
        type: 'text',
        admin: {
          readOnly: true,
          description: 'First and last 4 characters of the key for identification.',
        },
      },
      { name: 'expiresAt', type: 'date' },
      { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
    ],
    hooks: {
      beforeChange: [
        async ({ data, operation }) => {
          if (operation !== 'create') return data
          if (data['keyHash']) return data

          const rawKey = generateApiKey()
          data['keyHash'] = await sha256Hex(rawKey)
          data['keyDisplay'] = `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}`
          // Surface the raw key on the operation result so the admin UI
          // can show it to the operator one time. Never persisted.
          ;(data as Record<string, unknown>).__rawKey = rawKey
          return data
        },
      ],
    },
  }
}

/** Generates a random API key prefixed with `tl_`. */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `tl_${hex}`
}

/** Hashes a string with SHA-256 using the Web Crypto API; returns lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
