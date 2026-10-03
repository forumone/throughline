import type { Access, CollectionConfig } from 'payload'

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
 * The plugin's field-level rules on the key's `user` relationship are left as
 * shipped: a new key is bound to whoever creates it.
 */
export function mcpApiKeyAccess(
  isAdmin: Access,
): (collection: CollectionConfig) => CollectionConfig {
  const adminOnly: Access = args => (isMcpApiKeyPrincipal(args.req.user) ? false : isAdmin(args))

  return collection => ({
    ...collection,
    access: {
      ...collection.access,
      read: adminOnly,
      create: adminOnly,
      update: adminOnly,
      delete: adminOnly,
      unlock: adminOnly,
    },
  })
}
