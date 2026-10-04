import type { Payload } from 'payload'
import { findAuditWriter } from '../audit/plugin.js'
import { fetchClientMetadata, isMetadataDocumentUrl, type FetchLike } from './cimd.js'
import { classifyRedirects, MCP_CLIENT_RULES, type McpClientKind } from './clients.js'
import { hashToken, newClientId, newToken, TOKEN_PREFIX, verifyPkce } from './crypto.js'
import {
  keys,
  MCP_OAUTH_CLIENTS_SLUG,
  MCP_OAUTH_GRANTS_SLUG,
  type McpAccessPolicy,
  type McpOAuthRuntime,
} from './runtime.js'

/*
The reads and writes behind the endpoints, kept apart from HTTP so the
integration test can drive them and the endpoints stay about parsing and
answering.

Everything here runs with `overrideAccess`: the collections refuse every write
through the API on purpose, and these functions are the checks instead.
*/

type Doc = Record<string, unknown>

export interface ClientRecord {
  id: number | string
  clientId: string
  name?: string
  kind: McpClientKind
  method: 'dcr' | 'cimd'
  redirectUris: string[]
}

const CIMD_REFRESH_MS = 24 * 60 * 60 * 1000

function asClient(doc: Doc): ClientRecord {
  return {
    id: doc['id'] as number | string,
    clientId: String(doc['clientId']),
    ...(typeof doc['name'] === 'string' ? { name: doc['name'] } : {}),
    kind: doc['kind'] as McpClientKind,
    method: doc['method'] as 'dcr' | 'cimd',
    redirectUris: Array.isArray(doc['redirectUris']) ? (doc['redirectUris'] as string[]) : [],
  }
}

async function findOne(payload: Payload, collection: string, where: Record<string, unknown>) {
  const { docs } = await payload.find({
    collection: collection as never,
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  return docs[0] as unknown as Doc | undefined
}

/**
 * A registration request's client, registered — or the one already registered
 * with the same name and redirects. Registering is unauthenticated by design
 * (RFC 7591), so identical requests share a row rather than each adding one.
 */
export async function registerClient(
  payload: Payload,
  policy: McpAccessPolicy,
  request: { redirectUris: unknown[]; name?: string },
): Promise<ClientRecord | { error: string }> {
  const classified = classifyRedirects(request.redirectUris, (kind) => policy.clients[kind])
  if ('error' in classified) return classified
  const redirectUris = [...(request.redirectUris as string[])].sort()
  const name = request.name?.slice(0, 200)

  const existing = await payload.find({
    collection: MCP_OAUTH_CLIENTS_SLUG as never,
    where: {
      and: [
        { method: { equals: 'dcr' } },
        { kind: { equals: classified.kind } },
        name ? { name: { equals: name } } : { name: { exists: false } },
      ],
    } as never,
    limit: 20,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  for (const doc of existing.docs as unknown as Doc[]) {
    const client = asClient(doc)
    if (JSON.stringify([...client.redirectUris].sort()) === JSON.stringify(redirectUris))
      return client
  }

  const created = await payload.create({
    collection: MCP_OAUTH_CLIENTS_SLUG as never,
    data: {
      clientId: newClientId(),
      ...(name ? { name } : {}),
      kind: classified.kind,
      method: 'dcr',
      redirectUris,
    } as never,
    overrideAccess: true,
  })
  return asClient(created as unknown as Doc)
}

/**
 * The client a `client_id` names: a registered one, or a metadata document,
 * fetched (and cached for a day) and held to the same allowlist.
 */
export async function resolveClient(
  payload: Payload,
  policy: McpAccessPolicy,
  clientId: unknown,
  fetchImpl?: FetchLike,
): Promise<ClientRecord | { error: string }> {
  if (typeof clientId !== 'string' || clientId === '') return { error: 'client_id is required.' }
  const found = await findOne(payload, MCP_OAUTH_CLIENTS_SLUG, { clientId: { equals: clientId } })

  if (!isMetadataDocumentUrl(clientId)) {
    if (!found)
      return { error: 'This app is not registered here. Remove the connector and add it again.' }
    const client = asClient(found)
    if (!policy.clients[client.kind]) {
      return {
        error: `${MCP_CLIENT_RULES[client.kind].label} connections are turned off on this site.`,
      }
    }
    return client
  }

  const fresh =
    found && typeof found['fetchedAt'] === 'string'
      ? Date.now() - Date.parse(found['fetchedAt']) < CIMD_REFRESH_MS
      : false
  if (found && fresh) {
    const client = asClient(found)
    if (!policy.clients[client.kind]) {
      return {
        error: `${MCP_CLIENT_RULES[client.kind].label} connections are turned off on this site.`,
      }
    }
    return client
  }

  const doc = await fetchClientMetadata(clientId, fetchImpl)
  if ('error' in doc) return doc
  const classified = classifyRedirects(doc.redirect_uris, (kind) => policy.clients[kind])
  if ('error' in classified) return classified

  const data = {
    clientId,
    ...(doc.client_name ? { name: doc.client_name.slice(0, 200) } : {}),
    kind: classified.kind,
    method: 'cimd',
    redirectUris: doc.redirect_uris,
    fetchedAt: new Date().toISOString(),
  }
  const saved = found
    ? await payload.update({
        collection: MCP_OAUTH_CLIENTS_SLUG as never,
        id: found['id'] as never,
        data: data as never,
        overrideAccess: true,
      })
    : await payload.create({
        collection: MCP_OAUTH_CLIENTS_SLUG as never,
        data: data as never,
        overrideAccess: true,
      })
  return asClient(saved as unknown as Doc)
}

export interface PendingRequest {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state?: string
}

/** Consent: a pending grant and the code that completes it. */
export async function createPendingGrant(
  payload: Payload,
  user: Doc,
  client: ClientRecord,
  request: PendingRequest,
): Promise<string> {
  const { token: key } = keys(payload)
  const code = newToken(TOKEN_PREFIX.code)
  const now = Date.now()

  // Codes nobody exchanged, from anyone, are swept here rather than by a job.
  await payload.delete({
    collection: MCP_OAUTH_GRANTS_SLUG as never,
    where: {
      and: [
        { status: { equals: 'pending' } },
        { codeExpiresAt: { less_than: new Date(now - 60 * 60 * 1000).toISOString() } },
      ],
    } as never,
    overrideAccess: true,
  })

  await payload.create({
    collection: MCP_OAUTH_GRANTS_SLUG as never,
    data: {
      user: user['id'],
      client: client.id,
      clientName: MCP_CLIENT_RULES[client.kind].label,
      kind: client.kind,
      status: 'pending',
      redirectHost: new URL(request.redirectUri).host,
      codeHash: hashToken(key, code),
      codeChallenge: request.codeChallenge,
      codeRedirectUri: request.redirectUri,
      codeExpiresAt: new Date(now + 60 * 1000).toISOString(),
    } as never,
    overrideAccess: true,
  })
  return code
}

export interface IssuedTokens {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export type TokenError = {
  error: 'invalid_grant' | 'invalid_request' | 'invalid_target'
  error_description: string
}

async function issue(
  payload: Payload,
  runtime: McpOAuthRuntime,
  grantId: unknown,
  extra: Record<string, unknown>,
): Promise<IssuedTokens> {
  const { token: key } = keys(payload)
  const access = newToken(TOKEN_PREFIX.access)
  const refresh = newToken(TOKEN_PREFIX.refresh)
  const now = Date.now()
  await payload.update({
    collection: MCP_OAUTH_GRANTS_SLUG as never,
    id: grantId as never,
    data: {
      ...extra,
      status: 'active',
      accessHash: hashToken(key, access),
      accessExpiresAt: new Date(now + runtime.accessTokenTtl * 1000).toISOString(),
      refreshHash: hashToken(key, refresh),
      refreshExpiresAt: new Date(now + runtime.refreshTokenTtl * 1000).toISOString(),
      lastUsedAt: new Date(now).toISOString(),
    } as never,
    overrideAccess: true,
  })
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: runtime.accessTokenTtl,
    refresh_token: refresh,
    scope: 'mcp',
  }
}

/** Ends a grant: its tokens stop working at once. */
export async function revokeGrant(payload: Payload, grant: Doc, reason: string): Promise<void> {
  await payload.update({
    collection: MCP_OAUTH_GRANTS_SLUG as never,
    id: grant['id'] as never,
    data: {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedReason: reason,
      accessHash: null,
      refreshHash: null,
    } as never,
    overrideAccess: true,
  })
  if (grant['status'] === 'active') await record(payload, grant, 'mcp.disconnected', reason)
}

async function record(
  payload: Payload,
  grant: Doc,
  action: 'mcp.connected' | 'mcp.disconnected',
  reason?: string,
): Promise<void> {
  const audit = findAuditWriter(payload)
  if (!audit) return
  const userId =
    typeof grant['user'] === 'object' && grant['user']
      ? (grant['user'] as Doc)['id']
      : grant['user']
  await audit({
    actor: { type: 'user', userId: String(userId) },
    action,
    mcpServer: 'payload',
    mcpTool: 'oauth',
    targetCollection: MCP_OAUTH_GRANTS_SLUG,
    targetId: String(grant['id']),
    targetTitle: String(grant['clientName'] ?? ''),
    summary:
      action === 'mcp.connected'
        ? `Connected ${String(grant['clientName'])} over MCP`
        : `Disconnected ${String(grant['clientName'])}${reason ? `: ${reason}` : ''}`,
  })
}

async function stillAllowed(
  payload: Payload,
  runtime: McpOAuthRuntime,
  policy: McpAccessPolicy,
  grant: Doc,
): Promise<{ user: Doc } | { reason: string }> {
  if (!policy.clients[grant['kind'] as McpClientKind]) {
    return { reason: `${String(grant['clientName'])} connections were turned off` }
  }
  const user = (await payload.findByID({
    collection: runtime.users as never,
    id: (typeof grant['user'] === 'object' && grant['user']
      ? (grant['user'] as Doc)['id']
      : grant['user']) as never,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as unknown as Doc | null
  if (!user) return { reason: 'the account no longer exists' }
  const verdict = runtime.eligible(user)
  if (verdict !== true) return { reason: verdict }
  return { user }
}

/** `grant_type=authorization_code`. */
export async function exchangeCode(
  payload: Payload,
  runtime: McpOAuthRuntime,
  policy: McpAccessPolicy,
  params: { code?: string; clientId?: string; redirectUri?: string; codeVerifier?: string },
): Promise<IssuedTokens | TokenError> {
  const { token: key } = keys(payload)
  if (!params.code || !params.clientId) {
    return { error: 'invalid_request', error_description: 'code and client_id are required.' }
  }
  const grant = await findOne(payload, MCP_OAUTH_GRANTS_SLUG, {
    codeHash: { equals: hashToken(key, params.code) },
  })
  if (!grant)
    return { error: 'invalid_grant', error_description: 'The authorization code is not valid.' }

  /*
  A code presented twice is a code somebody else has: RFC 6749 §4.1.2 says to
  revoke what it already issued, so the legitimate app is signed out too and
  the person reconnects, rather than an attacker keeping a session.
  */
  if (grant['status'] !== 'pending') {
    await revokeGrant(payload, grant, 'its authorization code was used twice')
    return {
      error: 'invalid_grant',
      error_description: 'The authorization code has already been used.',
    }
  }
  if (Date.parse(String(grant['codeExpiresAt'])) < Date.now()) {
    return { error: 'invalid_grant', error_description: 'The authorization code has expired.' }
  }
  const client = await findOne(payload, MCP_OAUTH_CLIENTS_SLUG, { id: { equals: grant['client'] } })
  if (!client || client['clientId'] !== params.clientId) {
    return {
      error: 'invalid_grant',
      error_description: 'The code was issued to a different client.',
    }
  }
  if (params.redirectUri !== undefined && params.redirectUri !== grant['codeRedirectUri']) {
    return {
      error: 'invalid_grant',
      error_description: 'redirect_uri does not match the authorization request.',
    }
  }
  if (!verifyPkce(params.codeVerifier, String(grant['codeChallenge']))) {
    return {
      error: 'invalid_grant',
      error_description: 'code_verifier does not match the code challenge.',
    }
  }
  const allowed = await stillAllowed(payload, runtime, policy, grant)
  if ('reason' in allowed) {
    await revokeGrant(payload, grant, allowed.reason)
    return { error: 'invalid_grant', error_description: `Not connected: ${allowed.reason}.` }
  }

  const tokens = await issue(payload, runtime, grant['id'], {
    connectedAt: new Date().toISOString(),
    codeExpiresAt: new Date(0).toISOString(),
  })
  await payload.update({
    collection: MCP_OAUTH_CLIENTS_SLUG as never,
    id: client['id'] as never,
    data: { lastUsedAt: new Date().toISOString() } as never,
    overrideAccess: true,
  })
  await record(payload, grant, 'mcp.connected')
  return tokens
}

/*
How long an already-rotated refresh token is forgiven. Clients refresh
concurrently — a proactive refresh racing a 401-driven one — and the loser
presents the token the winner just rotated. Inside this window that is a race,
answered `invalid_grant` and nothing more; outside it, it is reuse of a stolen
token, and the whole grant is revoked (OAuth 2.1 §4.3.1).
*/
const ROTATION_GRACE_MS = 60 * 1000

/** `grant_type=refresh_token`. */
export async function refresh(
  payload: Payload,
  runtime: McpOAuthRuntime,
  policy: McpAccessPolicy,
  params: { refreshToken?: string; clientId?: string },
): Promise<IssuedTokens | TokenError> {
  const { token: key } = keys(payload)
  if (!params.refreshToken) {
    return { error: 'invalid_request', error_description: 'refresh_token is required.' }
  }
  const hash = hashToken(key, params.refreshToken)
  const grant = await findOne(payload, MCP_OAUTH_GRANTS_SLUG, { refreshHash: { equals: hash } })

  if (!grant) {
    const rotated = await findOne(payload, MCP_OAUTH_GRANTS_SLUG, {
      previousRefreshHash: { equals: hash },
    })
    if (rotated && rotated['status'] === 'active') {
      const since = Date.now() - Date.parse(String(rotated['rotatedAt'] ?? 0))
      if (since > ROTATION_GRACE_MS) {
        await revokeGrant(payload, rotated, 'a refresh token was used after it had been replaced')
      }
    }
    return { error: 'invalid_grant', error_description: 'The refresh token is not valid.' }
  }
  if (grant['status'] !== 'active') {
    return { error: 'invalid_grant', error_description: 'This connection has been revoked.' }
  }
  if (Date.parse(String(grant['refreshExpiresAt'])) < Date.now()) {
    return {
      error: 'invalid_grant',
      error_description: 'The refresh token has expired. Connect again.',
    }
  }
  if (params.clientId) {
    const client = await findOne(payload, MCP_OAUTH_CLIENTS_SLUG, {
      id: { equals: grant['client'] },
    })
    if (!client || client['clientId'] !== params.clientId) {
      return {
        error: 'invalid_grant',
        error_description: 'The refresh token was issued to a different client.',
      }
    }
  }
  const allowed = await stillAllowed(payload, runtime, policy, grant)
  if ('reason' in allowed) {
    await revokeGrant(payload, grant, allowed.reason)
    return { error: 'invalid_grant', error_description: `Disconnected: ${allowed.reason}.` }
  }
  return issue(payload, runtime, grant['id'], {
    previousRefreshHash: hash,
    rotatedAt: new Date().toISOString(),
  })
}

/** RFC 7009. Unknown tokens are not an error. */
export async function revokeToken(payload: Payload, token: unknown): Promise<void> {
  if (typeof token !== 'string' || token === '') return
  const { token: key } = keys(payload)
  const hash = hashToken(key, token)
  const grant =
    (await findOne(payload, MCP_OAUTH_GRANTS_SLUG, { accessHash: { equals: hash } })) ??
    (await findOne(payload, MCP_OAUTH_GRANTS_SLUG, { refreshHash: { equals: hash } }))
  if (grant && grant['status'] !== 'revoked')
    await revokeGrant(payload, grant, 'the app disconnected')
}

/** An access token's grant and person, if it is live and still allowed. */
export async function authenticateAccessToken(
  payload: Payload,
  runtime: McpOAuthRuntime,
  policy: McpAccessPolicy,
  token: string,
): Promise<{ user: Doc; grant: Doc } | { reason: string }> {
  const { token: key } = keys(payload)
  const grant = await findOne(payload, MCP_OAUTH_GRANTS_SLUG, {
    accessHash: { equals: hashToken(key, token) },
  })
  if (!grant || grant['status'] !== 'active') return { reason: 'The access token is not valid.' }
  if (Date.parse(String(grant['accessExpiresAt'])) < Date.now()) {
    return { reason: 'The access token has expired.' }
  }
  const allowed = await stillAllowed(payload, runtime, policy, grant)
  if ('reason' in allowed) {
    await revokeGrant(payload, grant, allowed.reason)
    return { reason: `Disconnected: ${allowed.reason}.` }
  }

  // At most one write every five minutes per connection, for "last used".
  const last = Date.parse(String(grant['lastUsedAt'] ?? 0))
  if (!(last > Date.now() - 5 * 60 * 1000)) {
    await payload.update({
      collection: MCP_OAUTH_GRANTS_SLUG as never,
      id: grant['id'] as never,
      data: { lastUsedAt: new Date().toISOString() } as never,
      overrideAccess: true,
    })
  }
  return { user: allowed.user, grant }
}
