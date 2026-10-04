import {
  ValidationError,
  type Access,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Field,
  type FieldAccess,
} from 'payload'

/*
Who may manage MCP keys, and who counts as signed in. Issue #157.

**The key collection.** `@payloadcms/plugin-mcp` brings `payload-mcp-api-keys`.
Older releases declared it with no `access` block, so every operation fell
through to Payload's `defaultAccess` — anybody signed in. Current ones scope each
person to their own keys. Neither is the right rule for a collection of
credentials: a key runs every tool as the person it is bound to, so who may mint,
read, rotate and revoke one is an administrator's decision. `mcpApiKeyAccess`
makes it one, through the plugin's `overrideApiKeyCollection`.

**The principal.** The collection sets `auth.useAPIKey: true`. Before Payload
3.89.0 that registered Payload's API-key strategy globally, so
`Authorization: payload-mcp-api-keys API-Key <key>` was accepted on every REST
route and put the *key document* on `req.user`, tagged
`collection: 'payload-mcp-api-keys'`. It has no roles, so role checks denied it;
`Boolean(req.user)` did not. On a site whose draft rule was "published, or
anybody signed in", that served every draft to anyone holding a key, with no MCP
involved.

3.89.0 excludes that slug from the strategy loop, and the suite's peer floor is
`^3.89.0` because of it. But one conditional in a dependency is not a control
anybody here would notice losing, so `isSignedIn` refuses the key principal
itself. Two things then have to fail for the hole to reopen.

**This cannot affect `/api/mcp`.** That endpoint resolves a presented key on its
own and runs the tool as the *user* the key points at, on the users collection,
with that person's roles. Only the REST strategy's principal carries the key
collection's slug, and that is the only principal refused here.
*/

/** The slug `@payloadcms/plugin-mcp` gives its key collection. */
export const MCP_API_KEYS_SLUG = 'payload-mcp-api-keys'

/** What Payload puts on `req.user`. */
export type AccessUser = Parameters<Access>[0]['req']['user']

/**
 * True when `req.user` is an MCP key document rather than a person.
 *
 * Only a request authenticated by Payload's REST API-key strategy against the
 * key collection carries this principal — which Payload 3.89.0 and later no
 * longer register. A tool call through `/api/mcp` arrives as the key's user.
 */
export function isMcpApiKeyPrincipal(user: AccessUser | undefined): boolean {
  return (user as { collection?: unknown } | null | undefined)?.collection === MCP_API_KEYS_SLUG
}

/**
 * A principal a site should treat as a signed-in person.
 *
 * Use this wherever an access rule would otherwise say `Boolean(req.user)` —
 * which is the rule Payload's own `defaultAccess` uses. A bearer credential
 * presented over REST is a `req.user` and is not somebody signed in.
 */
export function isSignedIn(user: AccessUser | undefined): user is NonNullable<AccessUser> {
  return Boolean(user) && !isMcpApiKeyPrincipal(user)
}

/** `isSignedIn` as a Payload `Access` function. */
export const signedIn: Access = ({ req }) => isSignedIn(req.user)

/**
 * An `overrideApiKeyCollection` for `mcpPlugin` that makes the key collection
 * admin-only: read, create, update, delete and unlock all answer to `isAdmin`.
 *
 * `isAdmin` is the site's own rule, since only the site knows what an
 * administrator is. Whatever it says, an MCP key principal is refused first, so
 * a key can never manage keys.
 *
 * It touches `access` and nothing else, so it composes with other overrides:
 *
 * ```ts
 * const keysAdminOnly = mcpApiKeyAccess(isAdmin)
 *
 * mcpPlugin({
 *   mcp: { tools: mcpTools.tools },
 *   overrideApiKeyCollection: collection => {
 *     const hardened = keysAdminOnly(collection)
 *     return { ...hardened, admin: { ...hardened.admin, group: 'Throughline' } }
 *   },
 * })
 * ```
 *
 * Without `holder`, the plugin's field-level rules on the key's `user`
 * relationship are left as shipped: a new key is bound to whoever creates it.
 * See `McpApiKeyAccessOptions.holder` for issuing a key to somebody else.
 */
export function mcpApiKeyAccess(
  isAdmin: Access,
  options: McpApiKeyAccessOptions = {},
): (collection: CollectionConfig) => CollectionConfig {
  const adminOnly: Access = args => (isMcpApiKeyPrincipal(args.req.user) ? false : isAdmin(args))

  return collection => {
    const hardened: CollectionConfig = {
      ...collection,
      access: {
        ...collection.access,
        read: adminOnly,
        create: adminOnly,
        update: adminOnly,
        delete: adminOnly,
        unlock: adminOnly,
      },
    }
    return options.holder ? issuedToAPerson(hardened, adminOnly, options.holder) : hardened
  }
}

export interface McpApiKeyAccessOptions {
  /**
   * Who may hold a key: `true`, or the reason they may not. Given, an
   * administrator chooses the person a new key runs as.
   *
   * The plugin binds every new key to whoever creates it and forbids changing
   * that, which is the safe default and the wrong one for a site where keys are
   * admin-only — every key then runs as an administrator, with an
   * administrator's permissions, in an administrator's name in the audit log.
   *
   * With this, the key's `user` may be set on create by whoever passes
   * `isAdmin`, and still never changed afterwards; the creator stays the
   * default. The chosen person is loaded and handed to this rule before the key
   * is saved, so "an editor or above" is the site's to say:
   *
   * ```ts
   * mcpApiKeyAccess(isAdmin, {
   *   holder: user => hasEditorRole(user) || 'Only an editor or an admin can hold a key.',
   * })
   * ```
   *
   * The rule is asked on create only. Somebody who loses the role later keeps a
   * key that their own access rules then refuse, tool by tool.
   */
  holder?: (user: Record<string, unknown>) => true | string
}

/** The plugin's name for the relationship a key runs as. */
const KEY_USER_FIELD = 'user'

/*
Payload strips a field from a create when its `create` access says no, and then
applies its `defaultValue`. So opening `create` to an administrator is all it
takes for their choice to stick, and leaving the default in place keeps "a key
for myself" a single click. `update` stays shut whatever the role: a key that
could be re-pointed is a key that could be made to act as anybody.

Field access is a boolean, where collection access may be a query, so only a
literal `true` from the site's rule counts.
*/
function issuedToAPerson(
  collection: CollectionConfig,
  adminOnly: Access,
  holder: NonNullable<McpApiKeyAccessOptions['holder']>,
): CollectionConfig {
  const field = collection.fields.find(
    (each): each is Extract<Field, { type: 'relationship' }> =>
      'name' in each && each.name === KEY_USER_FIELD && each.type === 'relationship',
  )
  if (!field || typeof field.relationTo !== 'string') {
    throw new Error(
      `mcpApiKeyAccess(): "${collection.slug}" has no single-collection "${KEY_USER_FIELD}" relationship, ` +
        'so there is nobody to issue a key to. Has @payloadcms/plugin-mcp changed its key collection?',
    )
  }

  const adminChooses: FieldAccess = async ({ req, data, id }) =>
    (await adminOnly({ req, data, id } as Parameters<Access>[0])) === true

  return {
    ...collection,
    fields: collection.fields.map(each =>
      each === field
        ? { ...field, access: { ...field.access, create: adminChooses, update: () => false } }
        : each,
    ),
    hooks: {
      ...collection.hooks,
      beforeChange: [
        ...(collection.hooks?.beforeChange ?? []),
        refuseIneligibleHolder(collection.slug, field.relationTo, holder),
      ],
    },
  }
}

/*
A `beforeChange` rather than a `validate` on the field, so the relationship keeps
Payload's own validation — required, and pointing at a document that exists —
and this only adds to it. By this point field access has run and the default has
been applied, so the value is the one that will be saved.
*/
function refuseIneligibleHolder(
  collection: string,
  users: string,
  holder: NonNullable<McpApiKeyAccessOptions['holder']>,
): CollectionBeforeChangeHook {
  return async ({ data, operation, req }) => {
    if (operation !== 'create') return data
    const value: unknown = data[KEY_USER_FIELD]
    const id =
      value && typeof value === 'object' ? (value as { id?: unknown }).id : (value as unknown)
    if (typeof id !== 'string' && typeof id !== 'number') return data

    const user = await req.payload.findByID({
      collection: users as never,
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    // A user that does not exist is the relationship's own validation to report.
    if (!user) return data

    const verdict = holder(user as unknown as Record<string, unknown>)
    if (verdict === true) return data
    throw new ValidationError({
      collection,
      errors: [{ path: KEY_USER_FIELD, label: 'User', message: verdict }],
    })
  }
}
