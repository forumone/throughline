import type { Payload } from 'payload'
import { AUTHORING_TOOL_DESCRIPTORS } from '../authoring/descriptors.js'
import { MCP_CLIENT_KINDS, type McpClientKind } from './clients.js'
import { deriveKey } from './crypto.js'

export const MCP_OAUTH_CLIENTS_SLUG = 'mcp-oauth-clients'
export const MCP_OAUTH_GRANTS_SLUG = 'mcp-oauth-grants'
export const MCP_ACCESS_SLUG = 'mcp-access'

/** The strategy name a person signed in through an OAuth token carries. */
export const MCP_OAUTH_STRATEGY = 'mcp-oauth'

type UserDoc = Record<string, unknown>

export interface McpOAuthOptions {
  /**
   * The site's public origin, e.g. `https://www.example.com`. The issuer, the
   * MCP resource and every endpoint are built from it, and a client compares
   * them byte for byte, so it must be the host people actually use: not an
   * alias that redirects, and not a deployment URL.
   */
  serverURL: string
  /** The site's name, as the consent screen and the Connect MCP page say it. */
  serverName: string
  /** The tools `plugin-mcp` serves: the same array the host hands `mcpPlugin`. */
  tools: readonly { name: string }[]
  /** The prompts it serves. Everybody who may connect is offered all of them. */
  prompts?: readonly { name: string }[]
  /** An administrator: chooses the policy, sees every connection, revokes any. */
  isAdmin: (user: UserDoc) => boolean
  /**
   * Who may connect at all: `true`, or the reason they may not. Asked at
   * consent, at every token refresh and on every MCP request, so somebody who
   * loses the role loses the connection with it.
   */
  eligible: (user: UserDoc) => true | string
  /**
   * The tools a non-administrator is offered until an administrator changes
   * it. Defaults to the authoring tools.
   */
  editorTools?: readonly string[]
  /** Which apps may connect until an administrator changes it. Each defaults on. */
  clients?: Partial<Record<McpClientKind, boolean>>
  /**
   * How people add the server to Claude. `organization` when a Team or
   * Enterprise Owner has added it for everybody, so members only click
   * Connect; `personal` (the default) when each person adds it themselves, and
   * the page links to Claude's add-connector form with the URL filled in.
   */
  claudeConnector?: 'organization' | 'personal'
  /**
   * The name Claude Code gives the server in the command the Connect MCP page
   * shows. Defaults to `serverName`, lowercased and hyphenated.
   */
  claudeCodeName?: string
  /** Default `/api`. */
  apiRoute?: string
  /** Where `plugin-mcp` serves, under `apiRoute`. Default `/mcp`. */
  mcpPath?: string
  /** Default `users`. */
  users?: string
  /** The admin sidebar group for the two collections. Default `Admin`. */
  adminGroup?: string
  /** The Connect MCP page, under the admin route. Default `/connect-mcp`. */
  connectPath?: string
  /** Seconds. Default an hour. */
  accessTokenTtl?: number
  /** Seconds since last use. Default thirty days. */
  refreshTokenTtl?: number
  /**
   * Also ask `eligible` of the person behind an API key, on every request.
   * Default true: an API key's holder is otherwise checked only when the key is
   * made.
   */
  recheckApiKeyHolders?: boolean
}

export interface McpOAuthRuntime {
  serverName: string
  claudeConnector: 'organization' | 'personal'
  claudeCodeName: string
  origin: string
  issuer: string
  resource: string
  apiRoute: string
  users: string
  connectPath: string
  accessTokenTtl: number
  refreshTokenTtl: number
  recheckApiKeyHolders: boolean
  isAdmin: (user: UserDoc) => boolean
  eligible: (user: UserDoc) => true | string
  defaults: { clients: Record<McpClientKind, boolean>; editorTools: readonly string[] }
  tools: readonly { name: string }[]
  prompts: readonly { name: string }[]
  endpoint: (name: string) => string
}

export const MCP_OAUTH_CUSTOM_KEY = 'throughline:mcp-oauth'

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'site'
  )
}

export function createRuntime(options: McpOAuthOptions): McpOAuthRuntime {
  let origin: string
  try {
    origin = new URL(options.serverURL).origin
  } catch {
    throw new Error(`mcpOAuth(): serverURL "${options.serverURL}" is not a URL.`)
  }
  const apiRoute = (options.apiRoute ?? '/api').replace(/\/+$/, '')
  const mcpPath = options.mcpPath ?? '/mcp'
  const served = new Set(options.tools.map((tool) => tool.name))
  const authoring = AUTHORING_TOOL_DESCRIPTORS.map((tool) => tool.name)

  return {
    serverName: options.serverName,
    claudeConnector: options.claudeConnector ?? 'personal',
    claudeCodeName: options.claudeCodeName ?? slug(options.serverName),
    origin,
    issuer: origin,
    resource: `${origin}${apiRoute}${mcpPath}`,
    apiRoute,
    users: options.users ?? 'users',
    connectPath: options.connectPath ?? '/connect-mcp',
    accessTokenTtl: options.accessTokenTtl ?? 60 * 60,
    refreshTokenTtl: options.refreshTokenTtl ?? 30 * 24 * 60 * 60,
    recheckApiKeyHolders: options.recheckApiKeyHolders ?? true,
    isAdmin: options.isAdmin,
    eligible: options.eligible,
    defaults: {
      clients: Object.fromEntries(
        MCP_CLIENT_KINDS.map((kind) => [kind, options.clients?.[kind] ?? true]),
      ) as Record<McpClientKind, boolean>,
      editorTools:
        options.editorTools ?? authoring.filter((name) => served.size === 0 || served.has(name)),
    },
    tools: options.tools,
    prompts: options.prompts ?? [],
    endpoint: (name) => `${origin}${apiRoute}/oauth/${name}`,
  }
}

/** The runtime `mcpOAuth` stored on the config, for the views. */
export function mcpOAuthRuntime(config: { custom?: Record<string, unknown> }): McpOAuthRuntime {
  const runtime = config.custom?.[MCP_OAUTH_CUSTOM_KEY] as McpOAuthRuntime | undefined
  if (!runtime) throw new Error('mcpOAuth() is not registered in this Payload config.')
  return runtime
}

export function keys(payload: Pick<Payload, 'secret'>) {
  return {
    token: deriveKey(payload.secret, 'token'),
    request: deriveKey(payload.secret, 'request'),
  }
}

/*
The policy an administrator edits, read with its defaults filled in.

A global that nobody has saved has no row, and one saved before a field existed
has no value for it; both read as the defaults the host configured. A tool the
policy names that is no longer served is dropped rather than passed on, and a
tool added since the policy was saved is *not* offered to non-administrators
until somebody ticks it — new capability is opt-in.
*/
export interface McpAccessPolicy {
  clients: Record<McpClientKind, boolean>
  editorTools: string[]
  adminAllTools: boolean
  adminTools: string[]
}

export async function readPolicy(
  payload: Payload,
  runtime: McpOAuthRuntime,
): Promise<McpAccessPolicy> {
  let doc: Record<string, unknown>
  try {
    doc = (await payload.findGlobal({
      slug: MCP_ACCESS_SLUG as never,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  } catch {
    doc = {}
  }
  const clients = (doc['clients'] ?? {}) as Record<string, unknown>
  const editors = (doc['editors'] ?? {}) as Record<string, unknown>
  const admins = (doc['admins'] ?? {}) as Record<string, unknown>
  const names = (value: unknown, fallback: readonly string[]) =>
    Array.isArray(value)
      ? value.filter((each): each is string => typeof each === 'string')
      : [...fallback]

  return {
    clients: Object.fromEntries(
      MCP_CLIENT_KINDS.map((kind) => [
        kind,
        typeof clients[kind] === 'boolean'
          ? (clients[kind] as boolean)
          : runtime.defaults.clients[kind],
      ]),
    ) as Record<McpClientKind, boolean>,
    editorTools: names(editors['tools'], runtime.defaults.editorTools),
    adminAllTools: typeof admins['allTools'] === 'boolean' ? (admins['allTools'] as boolean) : true,
    adminTools: names(admins['tools'], []),
  }
}

/** The tools a person is offered under a policy, by served name. */
export function toolsFor(
  user: UserDoc,
  policy: McpAccessPolicy,
  runtime: Pick<McpOAuthRuntime, 'isAdmin' | 'tools'>,
): string[] {
  const served = runtime.tools.map((tool) => tool.name)
  if (runtime.isAdmin(user)) {
    if (policy.adminAllTools) return served
    return served.filter((name) => policy.adminTools.includes(name))
  }
  return served.filter((name) => policy.editorTools.includes(name))
}

/** `plugin-mcp`'s key for a tool or prompt name. Its own `toCamelCase`. */
export function toCamelCase(value: string): string {
  return value
    .replace(/[-_\s]+(.)?/g, (_, chr: string | undefined) => (chr ? chr.toUpperCase() : ''))
    .replace(/^(.)/, (_, chr: string) => chr.toLowerCase())
}
