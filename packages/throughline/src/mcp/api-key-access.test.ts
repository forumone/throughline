import {
  ValidationError,
  type Access,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Field,
  type FieldAccess,
} from 'payload'
import { describe, expect, it, vi } from 'vitest'
import {
  MCP_API_KEYS_SLUG,
  isMcpApiKeyPrincipal,
  isSignedIn,
  mcpApiKeyAccess,
  signedIn,
} from './api-key-access.js'

/*
Four principals, and what each may do.

The key fixture is what Payload's REST API-key strategy put on `req.user` before
3.89.0: the key document itself. Its `id` is `1` on purpose — key ids and user
ids are small integers from different tables, so a self-scoped rule
(`{ id: { equals: req.user.id } }`) would have matched the first account.

`mcpUser` is what `/api/mcp` puts there instead: the person the key is bound to.
It must keep passing everything the key fixture is refused.
*/

type User = NonNullable<Parameters<Access>[0]['req']['user']>

const admin = { id: 1, collection: 'users', roles: ['admin'] } as unknown as User
const editor = { id: 2, collection: 'users', roles: ['editor'] } as unknown as User
const mcpUser = {
  id: 2,
  collection: 'users',
  _strategy: 'mcp-api-key',
  roles: ['editor'],
} as unknown as User
const apiKey = {
  id: 1,
  collection: MCP_API_KEYS_SLUG,
  _strategy: 'api-key',
  label: 'unlabelled',
} as unknown as User

const args = (user: User | null) => ({ req: { user } }) as unknown as Parameters<Access>[0]

/** The site's rule. Deliberately naive: it never looks at `collection`. */
const isAdmin: Access = ({ req }) =>
  Array.isArray((req.user as { roles?: unknown } | null)?.roles) &&
  ((req.user as unknown as { roles: unknown[] }).roles.includes('admin') ||
    (req.user as unknown as { roles: unknown[] }).roles.includes('*'))

/** Roughly what `@payloadcms/plugin-mcp` declares. */
const ownKeysOnly: Access = ({ req }) => (req.user ? { user: { equals: req.user.id } } : false)
const pluginCollection: CollectionConfig = {
  slug: MCP_API_KEYS_SLUG,
  admin: { group: 'MCP', useAsTitle: 'label' },
  auth: { disableLocalStrategy: true, useAPIKey: true },
  access: {
    read: ownKeysOnly,
    create: ({ req }) => Boolean(req.user),
    update: ownKeysOnly,
    delete: ownKeysOnly,
    unlock: ownKeysOnly,
    readVersions: () => true,
  },
  fields: [{ name: 'label', type: 'text' }],
}

describe('isMcpApiKeyPrincipal', () => {
  it('recognises a key document by its collection', () => {
    expect(isMcpApiKeyPrincipal(apiKey)).toBe(true)
  })

  it('does not recognise a person, including one an MCP tool call runs as', () => {
    expect(isMcpApiKeyPrincipal(editor)).toBe(false)
    expect(isMcpApiKeyPrincipal(mcpUser)).toBe(false)
    expect(isMcpApiKeyPrincipal(null)).toBe(false)
    expect(isMcpApiKeyPrincipal(undefined)).toBe(false)
  })
})

describe('isSignedIn', () => {
  it('accepts a signed-in person', () => {
    expect(isSignedIn(admin)).toBe(true)
    expect(isSignedIn(editor)).toBe(true)
  })

  it('accepts the user an MCP tool call arrives as', () => {
    expect(isSignedIn(mcpUser)).toBe(true)
  })

  it('refuses a key document, which `Boolean(req.user)` would not', () => {
    expect(Boolean(apiKey)).toBe(true)
    expect(isSignedIn(apiKey)).toBe(false)
  })

  it('refuses an anonymous request', () => {
    expect(isSignedIn(null)).toBe(false)
    expect(isSignedIn(undefined)).toBe(false)
  })

  it('is available as an Access function', () => {
    expect(signedIn(args(editor))).toBe(true)
    expect(signedIn(args(apiKey))).toBe(false)
    expect(signedIn(args(null))).toBe(false)
  })
})

describe('mcpApiKeyAccess', () => {
  const hardened = mcpApiKeyAccess(isAdmin)(pluginCollection)
  const operations = ['read', 'create', 'update', 'delete', 'unlock'] as const

  it.each(operations)('lets an admin %s keys — every key, not only their own', operation => {
    expect(hardened.access?.[operation]?.(args(admin))).toBe(true)
  })

  it.each(operations)('refuses a non-admin %s', operation => {
    expect(hardened.access?.[operation]?.(args(editor))).toBe(false)
    expect(hardened.access?.[operation]?.(args(mcpUser))).toBe(false)
  })

  it.each(operations)('refuses an anonymous %s', operation => {
    expect(hardened.access?.[operation]?.(args(null))).toBe(false)
  })

  it.each(operations)('refuses a key principal %s, whatever the site rule says', operation => {
    // A rule that would admit anything with a wildcard role, handed a key that
    // somehow carries one: the key is still refused before the rule is asked.
    const keyWithRoles = { ...apiKey, roles: ['*'] } as unknown as User
    expect(isAdmin(args(keyWithRoles))).toBe(true)
    expect(hardened.access?.[operation]?.(args(keyWithRoles))).toBe(false)
  })

  it('passes through whatever the site rule returns, including a query', () => {
    const scoped: Access = () => ({ user: { equals: 1 } })
    const out = mcpApiKeyAccess(scoped)(pluginCollection)
    expect(out.access?.read?.(args(admin))).toEqual({ user: { equals: 1 } })
  })

  it('changes access and nothing else, so it composes with other overrides', () => {
    expect(hardened.slug).toBe(MCP_API_KEYS_SLUG)
    expect(hardened.admin).toBe(pluginCollection.admin)
    expect(hardened.auth).toBe(pluginCollection.auth)
    expect(hardened.fields).toBe(pluginCollection.fields)
    // An operation it does not narrow is kept.
    expect(hardened.access?.readVersions).toBe(pluginCollection.access?.readVersions)

    const grouped = { ...hardened, admin: { ...hardened.admin, group: 'Throughline' } }
    expect(grouped.admin.group).toBe('Throughline')
    expect(grouped.access?.read?.(args(editor))).toBe(false)
  })

  it('does not mutate the collection it is given', () => {
    expect(pluginCollection.access?.read).toBe(ownKeysOnly)
  })

  it('leaves the key bound to its creator unless a holder rule is given', () => {
    const keyed = mcpApiKeyAccess(isAdmin)(keyedCollection)
    expect(keyed.fields).toBe(keyedCollection.fields)
    expect(keyed.hooks).toBe(keyedCollection.hooks)
  })
})

/*
Issuing a key to somebody else. The field fixture is what the plugin ships as of
3.90: create and update both shut, the creator as the default.
*/

const creatorByDefault = ({ req }: { req: { user?: { id?: unknown } | null } }) => req.user?.id
const pluginUserField: Field = {
  name: 'user',
  type: 'relationship',
  relationTo: 'users',
  required: true,
  access: { create: () => false, update: () => false },
  defaultValue: creatorByDefault,
}
const keyedCollection: CollectionConfig = {
  ...pluginCollection,
  fields: [pluginUserField, { name: 'label', type: 'text' }],
  hooks: { beforeChange: [({ data }) => data] },
}

const people: Record<number, Record<string, unknown>> = {
  1: { id: 1, roles: ['admin'] },
  2: { id: 2, roles: ['editor'] },
  3: { id: 3, email: 'author@example.org', roles: ['author'] },
}
const editorOrAbove = (user: Record<string, unknown>) => {
  const roles = Array.isArray(user['roles']) ? (user['roles'] as unknown[]) : []
  return (
    roles.includes('admin') ||
    roles.includes('editor') ||
    'Only an editor or an admin can hold a key.'
  )
}

describe('mcpApiKeyAccess with a holder rule', () => {
  const issued = mcpApiKeyAccess(isAdmin, { holder: editorOrAbove })(keyedCollection)
  const userField = issued.fields.find(
    each => 'name' in each && each.name === 'user',
  ) as Extract<Field, { type: 'relationship' }>
  const fieldArgs = (user: User | null) =>
    ({ req: { user } }) as unknown as Parameters<FieldAccess>[0]

  const findByID = vi.fn(({ id }: { id: number }) => Promise.resolve(people[id] ?? null))
  const hook = issued.hooks!.beforeChange!.at(-1)!
  const save = (data: Record<string, unknown>, operation: 'create' | 'update' = 'create') =>
    hook({
      data,
      operation,
      req: { payload: { findByID } },
    } as unknown as Parameters<CollectionBeforeChangeHook>[0])

  it('lets an admin choose who a new key runs as', async () => {
    expect(await userField.access?.create?.(fieldArgs(admin))).toBe(true)
  })

  it('lets nobody else choose, so their key is bound to them', async () => {
    expect(await userField.access?.create?.(fieldArgs(editor))).toBe(false)
    expect(await userField.access?.create?.(fieldArgs(mcpUser))).toBe(false)
    expect(await userField.access?.create?.(fieldArgs(null))).toBe(false)
  })

  it('refuses a key principal the choice, even one carrying an admin role', async () => {
    const keyWithRoles = { ...apiKey, roles: ['admin'] } as unknown as User
    expect(await userField.access?.create?.(fieldArgs(keyWithRoles))).toBe(false)
  })

  it('counts only a literal true from the site rule, never a query', async () => {
    const scoped: Access = () => ({ user: { equals: 1 } })
    const out = mcpApiKeyAccess(scoped, { holder: editorOrAbove })(keyedCollection)
    const field = out.fields[0] as Extract<Field, { type: 'relationship' }>
    expect(await field.access?.create?.(fieldArgs(admin))).toBe(false)
  })

  it('never lets anybody re-point a key, admins included', async () => {
    expect(await userField.access?.update?.(fieldArgs(admin))).toBe(false)
  })

  it('keeps the creator as the default', () => {
    expect(userField.defaultValue).toBe(creatorByDefault)
  })

  it('saves a key for somebody the rule accepts', async () => {
    await expect(save({ user: 2 })).resolves.toEqual({ user: 2 })
    await expect(save({ user: { id: 1 } })).resolves.toEqual({ user: { id: 1 } })
  })

  it('refuses a key for somebody the rule does not, with its reason', async () => {
    const result = save({ user: 3 })
    await expect(result).rejects.toBeInstanceOf(ValidationError)
    await expect(result).rejects.toMatchObject({
      data: { errors: [{ path: 'user', message: 'Only an editor or an admin can hold a key.' }] },
    })
  })

  it('reads the person past access control, since an admin may not read every user', async () => {
    findByID.mockClear()
    await save({ user: 2 })
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 2, overrideAccess: true }),
    )
  })

  it('leaves a missing or unknown user to the relationship validation', async () => {
    await expect(save({})).resolves.toEqual({})
    await expect(save({ user: 99 })).resolves.toEqual({ user: 99 })
  })

  it('asks only on create: a key whose holder lost the role can still be relabelled', async () => {
    findByID.mockClear()
    await expect(save({ user: 3, label: 'renamed' }, 'update')).resolves.toBeTruthy()
    expect(findByID).not.toHaveBeenCalled()
  })

  it("runs after the collection's own hooks rather than replacing them", () => {
    expect(issued.hooks?.beforeChange?.[0]).toBe(keyedCollection.hooks?.beforeChange?.[0])
    expect(issued.hooks?.beforeChange).toHaveLength(2)
  })

  it('keeps the other fields as they were', () => {
    expect(issued.fields[1]).toBe(keyedCollection.fields[1])
  })

  it('refuses a key collection with no user relationship to bind', () => {
    expect(() =>
      mcpApiKeyAccess(isAdmin, { holder: editorOrAbove })(pluginCollection),
    ).toThrow(/no single-collection "user" relationship/)
  })
})
