import type { Access, CollectionConfig, Field, GlobalConfig, PayloadRequest } from 'payload'
import { isMcpApiKeyPrincipal } from '../mcp/api-key-access.js'
import { MCP_CLIENT_KINDS, MCP_CLIENT_RULES } from './clients.js'
import {
  MCP_ACCESS_SLUG,
  MCP_OAUTH_CLIENTS_SLUG,
  MCP_OAUTH_GRANTS_SLUG,
  MCP_OAUTH_STRATEGY,
  type McpOAuthRuntime,
} from './runtime.js'

/*
Where connections are kept, and who may see them.

**Nothing here is written through the API.** Clients are registered by
`/oauth/register`, grants by consent and the token endpoint, both with
`overrideAccess`; `create` and `update` answer no to everybody, administrators
included, so the only way to make a grant is to go through consent as yourself.

**A person sees their own connections; an administrator sees everyone's.** That
is what the Connect MCP page lists, and it is a query constraint rather than a
check after the fact, so the list and the count agree.

**The token hashes are unreadable.** They are hidden in the admin and refused by
field access, so not even an administrator's REST read returns them; the
endpoints read them with `overrideAccess`.

**A request that arrived through MCP may not touch any of it.** Neither the key
principal Payload's REST strategy once produced nor a person signed in by an
OAuth token: a connection cannot list, mint or revoke connections.
*/

type UserDoc = Record<string, unknown>

/** The person signed in to the admin, or nobody if the request came through MCP. */
export function signedInPerson(req: PayloadRequest): UserDoc | undefined {
  const user = req.user as unknown as UserDoc | null | undefined
  if (!user || isMcpApiKeyPrincipal(user as never)) return undefined
  if (user['_strategy'] === MCP_OAUTH_STRATEGY || user['_strategy'] === 'mcp-api-key')
    return undefined
  return user
}

function adminOnly(runtime: McpOAuthRuntime): Access {
  return ({ req }) => {
    const user = signedInPerson(req)
    return Boolean(user && runtime.isAdmin(user))
  }
}

function ownOrAdmin(runtime: McpOAuthRuntime): Access {
  return ({ req }) => {
    const user = signedInPerson(req)
    if (!user) return false
    if (runtime.isAdmin(user)) return true
    return { user: { equals: user['id'] } }
  }
}

const never: Access = () => false
const secret = { read: () => false, create: () => false, update: () => false }

const kindOptions = MCP_CLIENT_KINDS.map((kind) => ({
  label: MCP_CLIENT_RULES[kind].label,
  value: kind,
}))

export function clientsCollection(runtime: McpOAuthRuntime, group: string): CollectionConfig {
  return {
    slug: MCP_OAUTH_CLIENTS_SLUG,
    labels: { singular: 'MCP client', plural: 'MCP clients' },
    admin: {
      group,
      useAsTitle: 'name',
      defaultColumns: ['name', 'kind', 'method', 'lastUsedAt'],
      description:
        'Apps that have registered to connect over MCP. Recognised by where they send people back to, not by the name they give.',
    },
    access: { read: adminOnly(runtime), create: never, update: never, delete: adminOnly(runtime) },
    fields: [
      {
        name: 'clientId',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'name',
        type: 'text',
        admin: { readOnly: true, description: 'What the app calls itself.' },
      },
      {
        name: 'kind',
        type: 'select',
        required: true,
        options: kindOptions,
        admin: { readOnly: true },
      },
      {
        name: 'method',
        type: 'select',
        required: true,
        options: [
          { label: 'Registered (DCR)', value: 'dcr' },
          { label: 'Metadata document (CIMD)', value: 'cimd' },
        ],
        admin: { readOnly: true },
      },
      { name: 'redirectUris', type: 'json', required: true, admin: { readOnly: true } },
      { name: 'fetchedAt', type: 'date', admin: { readOnly: true, hidden: true } },
      { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
    ],
  }
}

export function grantsCollection(runtime: McpOAuthRuntime, group: string): CollectionConfig {
  const hidden = (name: string, type: 'text' | 'date' = 'text', index = false): Field =>
    ({ name, type, index, access: secret, admin: { hidden: true } }) as Field

  return {
    slug: MCP_OAUTH_GRANTS_SLUG,
    labels: { singular: 'Connected app', plural: 'Connected apps' },
    admin: {
      group,
      useAsTitle: 'clientName',
      defaultColumns: ['clientName', 'user', 'status', 'lastUsedAt', 'connectedAt'],
      description:
        'Every app somebody has connected over MCP, as them. Revoking one signs that app out at once.',
      // Everybody else sees their own on Connect MCP, which is where they look.
      hidden: ({ user }) => !(user && runtime.isAdmin(user as unknown as UserDoc)),
    },
    access: {
      read: ownOrAdmin(runtime),
      create: never,
      update: never,
      delete: adminOnly(runtime),
    },
    fields: [
      {
        name: 'user',
        type: 'relationship',
        relationTo: runtime.users as never,
        required: true,
        index: true,
        admin: { readOnly: true },
      },
      { name: 'clientName', type: 'text', required: true, admin: { readOnly: true } },
      {
        name: 'kind',
        type: 'select',
        required: true,
        options: kindOptions,
        admin: { readOnly: true },
      },
      {
        name: 'client',
        type: 'relationship',
        relationTo: MCP_OAUTH_CLIENTS_SLUG as never,
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'pending',
        index: true,
        options: [
          { label: 'Waiting for the app', value: 'pending' },
          { label: 'Connected', value: 'active' },
          { label: 'Revoked', value: 'revoked' },
        ],
        admin: { readOnly: true },
      },
      { name: 'redirectHost', type: 'text', admin: { readOnly: true } },
      { name: 'connectedAt', type: 'date', admin: { readOnly: true } },
      { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
      { name: 'revokedAt', type: 'date', admin: { readOnly: true } },
      { name: 'revokedReason', type: 'text', admin: { readOnly: true } },
      hidden('codeHash', 'text', true),
      hidden('codeChallenge'),
      hidden('codeRedirectUri'),
      hidden('codeExpiresAt', 'date'),
      hidden('accessHash', 'text', true),
      hidden('accessExpiresAt', 'date'),
      hidden('refreshHash', 'text', true),
      hidden('previousRefreshHash', 'text', true),
      hidden('rotatedAt', 'date'),
      hidden('refreshExpiresAt', 'date'),
    ],
  }
}

/*
The policy: which apps may connect, and what each role is offered once they
have. An administrator's to edit, and read by the endpoints with
`overrideAccess`. Its defaults are the host's, so an unsaved global behaves as
configured (see `readPolicy`).
*/
export function accessGlobal(runtime: McpOAuthRuntime, group: string): GlobalConfig {
  const toolOptions = runtime.tools.map((tool) => ({ label: tool.name, value: tool.name }))
  const admin = adminOnly(runtime)

  return {
    slug: MCP_ACCESS_SLUG,
    label: 'MCP access',
    admin: {
      group,
      description:
        'Who can connect AI apps to this site over MCP, and what each role can do once connected. Changes apply to existing connections at their next request.',
    },
    access: { read: admin, update: admin },
    fields: [
      {
        name: 'clients',
        type: 'group',
        label: 'Apps that may connect',
        admin: {
          description:
            'Turning an app off refuses new connections and signs out existing ones at their next request.',
        },
        fields: MCP_CLIENT_KINDS.map((kind): Field => ({
          name: kind,
          type: 'checkbox',
          label: MCP_CLIENT_RULES[kind].label,
          defaultValue: runtime.defaults.clients[kind],
          ...(kind === 'claudeCode'
            ? {
                admin: {
                  description:
                    'Signs in through a browser on the person’s own computer. Any app there that uses the same localhost callback is treated the same way.',
                },
              }
            : {}),
        })),
      },
      {
        name: 'editors',
        type: 'group',
        label: 'Everyone who is not an administrator',
        fields: [
          {
            name: 'tools',
            type: 'select',
            hasMany: true,
            options: toolOptions,
            defaultValue: [...runtime.defaults.editorTools],
            admin: {
              description:
                'The tools they are offered. A tool added to the site later is not offered until it is ticked here.',
            },
          },
        ],
      },
      {
        name: 'admins',
        type: 'group',
        label: 'Administrators',
        fields: [
          {
            name: 'allTools',
            type: 'checkbox',
            label: 'Every tool, including ones added later',
            defaultValue: true,
          },
          {
            name: 'tools',
            type: 'select',
            hasMany: true,
            options: toolOptions,
            admin: {
              condition: (_, sibling) => !(sibling as { allTools?: boolean }).allTools,
            },
          },
        ],
      },
    ],
  }
}
