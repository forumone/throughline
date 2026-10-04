import { createHash, randomBytes } from 'node:crypto'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import type { Inngest } from 'inngest'
import {
  buildConfig,
  getPayload,
  handleEndpoints,
  type Payload,
  type PayloadRequest,
  type SanitizedConfig,
} from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditPlugin } from '../audit/plugin.js'
import type { McpAccessSettings } from './auth.js'
import { mcpOAuth } from './plugin.js'
import { MCP_ACCESS_SLUG, MCP_OAUTH_GRANTS_SLUG } from './runtime.js'

/*
The whole sign-in, against a real Payload: register, authorize, consent as a
signed-in person, exchange, call `/api/mcp`'s auth, refresh, revoke — and every
way it is meant to refuse. Through `handleEndpoints`, so the routing, the cookie
strategy and the 401's headers are Payload's own rather than a stand-in's.

`plugin-mcp` itself is not loaded: `overrideAuth` is called the way it calls
it, with a stand-in for its key resolver. The site's end-to-end run covers the
plugin.
*/

const ORIGIN = 'https://site.example'
const inngest = { send: async () => ({}) } as unknown as Inngest
const tools = [{ name: 'find' }, { name: 'save_draft' }, { name: 'query_audit' }]
const prompts = [{ name: 'draft_post' }]

const CLAUDE_CODE_CIMD = 'https://claude.ai/oauth/claude-code-client-metadata'
let cimdFetches = 0
const fakeFetch = async (url: string) => {
  cimdFetches += 1
  if (url !== CLAUDE_CODE_CIMD) return new Response('nope', { status: 404 })
  return Response.json({
    client_id: CLAUDE_CODE_CIMD,
    client_name: 'Claude Code',
    redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    token_endpoint_auth_method: 'none',
  })
}

const hasRole = (user: Record<string, unknown>, ...roles: string[]) =>
  Array.isArray(user['roles']) && roles.some((role) => (user['roles'] as string[]).includes(role))

const oauth = mcpOAuth(
  {
    serverURL: `${ORIGIN}/anything`,
    serverName: 'Example Site',
    tools,
    prompts,
    isAdmin: (user) => hasRole(user, 'admin'),
    eligible: (user) =>
      hasRole(user, 'admin', 'editor') || 'Only an editor or an admin can connect.',
    clients: { chatgpt: false },
  },
  { fetch: fakeFetch as never },
)

let payload: Payload
let config: SanitizedConfig
const cookies: Record<string, string> = {}
const ids: Record<string, number | string> = {}

async function call(
  method: string,
  path: string,
  init: { body?: string; type?: string; cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers = new Headers()
  if (init.type) headers.set('content-type', init.type)
  if (init.cookie) headers.set('cookie', `payload-token=${init.cookie}`)
  if (init.origin) headers.set('origin', init.origin)
  return handleEndpoints({
    config,
    request: new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
    }),
  })
}

const form = (values: Record<string, string>) => new URLSearchParams(values).toString()

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function register(redirectUris: string[]) {
  return call('POST', '/api/oauth/register', {
    type: 'application/json',
    body: JSON.stringify({
      client_name: 'Claude',
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
    }),
  })
}

/** Authorize → consent → code, as `who`. */
async function connect(who: string, clientId: string, redirectUri: string) {
  const { verifier, challenge } = pkce()
  const authorize = await call(
    'GET',
    `/api/oauth/authorize?${form({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      resource: `${ORIGIN}/api/mcp`,
    })}`,
  )
  expect(authorize.status).toBe(302)
  const location = authorize.headers.get('location') ?? ''
  expect(location).toMatch(/^\/admin\/connect-mcp\/authorize\?request=/)
  const request = new URL(location, ORIGIN).searchParams.get('request') ?? ''

  const consent = await call('POST', '/api/oauth/consent', {
    type: 'application/json',
    body: JSON.stringify({ request, decision: 'allow' }),
    cookie: cookies[who] ?? '',
    origin: ORIGIN,
  })
  const answer = (await consent.json()) as { redirect?: string; error?: string }
  return { consent, answer, verifier, request }
}

async function exchange(clientId: string, redirectUri: string, code: string, verifier: string) {
  return call('POST', '/api/oauth/token', {
    type: 'application/x-www-form-urlencoded',
    body: form({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: `${ORIGIN}/api/mcp`,
    }),
  })
}

async function mcpAuth(token: string, keyUser?: Record<string, unknown>) {
  const headers = new Headers({ authorization: `Bearer ${token}` })
  const req = { headers, payload } as unknown as PayloadRequest
  try {
    const settings = await oauth.overrideAuth(req, async () => {
      if (!keyUser) throw new Error('no such key')
      return { user: keyUser } as McpAccessSettings
    })
    return { settings }
  } catch (error) {
    return { error, challenge: req.responseHeaders?.get('WWW-Authenticate') ?? '' }
  }
}

beforeAll(async () => {
  config = await buildConfig({
    secret: 'oauth-integration-secret-0000000000',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    collections: [
      {
        slug: 'users',
        auth: true,
        fields: [
          { name: 'name', type: 'text' },
          {
            name: 'roles',
            type: 'select',
            hasMany: true,
            options: ['admin', 'editor', 'approver'],
          },
        ],
      },
    ],
    plugins: [auditPlugin({ inngest }), oauth.plugin],
    typescript: { autoGenerate: false },
    logger: { options: { level: 'silent' } },
  })
  payload = await getPayload({ config })

  for (const [who, roles] of [
    ['editor', ['editor']],
    ['admin', ['admin']],
    ['approver', ['approver']],
  ] as const) {
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `${who}@site.example`,
        password: 'correct-horse-battery',
        name: who,
        roles: [...roles],
      } as never,
    })
    ids[who] = user.id
    const login = await payload.login({
      collection: 'users',
      data: { email: `${who}@site.example`, password: 'correct-horse-battery' },
    })
    cookies[who] = login.token ?? ''
  }
})

afterAll(async () => {
  await payload.db.destroy?.()
})

describe('discovery', () => {
  it('serves both documents with the values clients check', async () => {
    const as = (await (await call('GET', '/api/oauth/metadata')).json()) as Record<string, unknown>
    expect(as['issuer']).toBe(ORIGIN)
    expect(as['token_endpoint_auth_methods_supported']).toEqual(['none'])
    expect(as['client_id_metadata_document_supported']).toBe(true)
    expect(as['code_challenge_methods_supported']).toEqual(['S256'])

    const prm = (await (await call('GET', '/api/oauth/protected-resource')).json()) as Record<
      string,
      unknown
    >
    expect(prm['resource']).toBe(`${ORIGIN}/api/mcp`)
    expect(prm['authorization_servers']).toEqual([ORIGIN])
  })

  it('challenges a request with no token, pointing at the metadata', async () => {
    const result = await mcpAuth('')
    expect(result.error).toBeDefined()
    expect(result.challenge).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    )
  })
})

describe('registration', () => {
  it('registers Claude, and gives an identical request the same client', async () => {
    const first = await register(['https://claude.ai/api/mcp/auth_callback'])
    expect(first.status).toBe(201)
    const a = (await first.json()) as { client_id: string; token_endpoint_auth_method: string }
    expect(a.token_endpoint_auth_method).toBe('none')
    const b = (await (await register(['https://claude.ai/api/mcp/auth_callback'])).json()) as {
      client_id: string
    }
    expect(b.client_id).toBe(a.client_id)
  })

  it('refuses a callback that is not on the list, and an app that is switched off', async () => {
    expect((await register(['https://evil.example/callback'])).status).toBe(400)
    const off = await register(['https://chatgpt.com/connector_platform_oauth_redirect'])
    expect(off.status).toBe(400)
    expect(((await off.json()) as { error_description: string }).error_description).toMatch(
      /turned off/,
    )
  })
})

describe('the whole flow', () => {
  const redirect = 'https://claude.ai/api/mcp/auth_callback'
  let clientId: string
  let tokens: { access_token: string; refresh_token: string }

  beforeAll(async () => {
    clientId = ((await (await register([redirect])).json()) as { client_id: string }).client_id
  })

  it('will not redirect to a callback the client did not register', async () => {
    const response = await call(
      'GET',
      `/api/oauth/authorize?${form({ response_type: 'code', client_id: clientId, redirect_uri: 'https://evil.example/cb', code_challenge: pkce().challenge, code_challenge_method: 'S256' })}`,
    )
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('sends a request without PKCE back to the app with an error and iss', async () => {
    const response = await call(
      'GET',
      `/api/oauth/authorize?${form({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state: 's' })}`,
    )
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.searchParams.get('error')).toBe('invalid_request')
    expect(location.searchParams.get('iss')).toBe(ORIGIN)
    expect(location.searchParams.get('state')).toBe('s')
  })

  it('refuses consent without a session, and from another origin', async () => {
    const { verifier: _v, challenge } = pkce()
    const authorize = await call(
      'GET',
      `/api/oauth/authorize?${form({ response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256' })}`,
    )
    const request =
      new URL(authorize.headers.get('location') ?? '', ORIGIN).searchParams.get('request') ?? ''
    const body = JSON.stringify({ request, decision: 'allow' })
    expect(
      (await call('POST', '/api/oauth/consent', { type: 'application/json', body, origin: ORIGIN }))
        .status,
    ).toBe(401)
    expect(
      (
        await call('POST', '/api/oauth/consent', {
          type: 'application/json',
          body,
          cookie: cookies['editor'] ?? '',
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403)
  })

  it('refuses a person whose role may not connect', async () => {
    const { consent, answer } = await connect('approver', clientId, redirect)
    expect(consent.status).toBe(403)
    expect(answer.error).toMatch(/editor or an admin/)
  })

  it('connects an editor, and offers them the editors’ tools only', async () => {
    const { answer, verifier } = await connect('editor', clientId, redirect)
    const back = new URL(answer.redirect ?? '')
    expect(`${back.origin}${back.pathname}`).toBe(redirect)
    expect(back.searchParams.get('state')).toBe('xyz')
    expect(back.searchParams.get('iss')).toBe(ORIGIN)
    const code = back.searchParams.get('code') ?? ''

    const response = await exchange(clientId, redirect, code, verifier)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    tokens = (await response.json()) as typeof tokens

    const { settings } = await mcpAuth(tokens.access_token)
    expect(settings?.user['id']).toBe(ids['editor'])
    expect(settings?.['payload-mcp-tool']).toEqual({ find: true, saveDraft: true })
    expect(settings?.['payload-mcp-prompt']).toEqual({ draftPost: true })

    // A second use of the same code is theft: refused, and the grant revoked.
    const again = await exchange(clientId, redirect, code, verifier)
    expect(((await again.json()) as { error: string }).error).toBe('invalid_grant')
    expect((await mcpAuth(tokens.access_token)).error).toBeDefined()
  })

  it('offers an administrator every tool, and records the connection', async () => {
    const { answer, verifier } = await connect('admin', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const issued = (await (
      await exchange(clientId, redirect, code, verifier)
    ).json()) as typeof tokens
    const { settings } = await mcpAuth(issued.access_token)
    expect(settings?.['payload-mcp-tool']).toEqual({
      find: true,
      saveDraft: true,
      queryAudit: true,
    })

    const { docs } = await payload.find({
      collection: 'audit-events',
      where: { action: { equals: 'mcp.connected' } },
    })
    expect(docs.length).toBeGreaterThan(0)
  })

  it('refuses a wrong verifier', async () => {
    const { answer } = await connect('editor', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const response = await exchange(clientId, redirect, code, pkce().verifier)
    expect(((await response.json()) as { error: string }).error).toBe('invalid_grant')
  })

  it('rotates refresh tokens, forgives a racing refresh, and revokes on later reuse', async () => {
    const { answer, verifier } = await connect('editor', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const first = (await (
      await exchange(clientId, redirect, code, verifier)
    ).json()) as typeof tokens

    const refreshWith = (token: string) =>
      call('POST', '/api/oauth/token', {
        type: 'application/x-www-form-urlencoded',
        body: form({ grant_type: 'refresh_token', refresh_token: token, client_id: clientId }),
      })

    const second = (await (await refreshWith(first.refresh_token)).json()) as typeof tokens
    expect(second.refresh_token).not.toBe(first.refresh_token)
    expect((await mcpAuth(first.access_token)).error).toBeDefined()
    expect((await mcpAuth(second.access_token)).settings).toBeDefined()

    // The old one again, at once: a race. Refused, but the connection stands.
    expect((await refreshWith(first.refresh_token)).status).toBe(400)
    expect((await mcpAuth(second.access_token)).settings).toBeDefined()

    // The old one again, later: theft. The connection is revoked.
    const { docs } = await payload.find({
      collection: MCP_OAUTH_GRANTS_SLUG as never,
      where: { status: { equals: 'active' }, user: { equals: ids['editor'] } } as never,
      overrideAccess: true,
    })
    for (const grant of docs as unknown as { id: number }[]) {
      await payload.update({
        collection: MCP_OAUTH_GRANTS_SLUG as never,
        id: grant.id,
        data: { rotatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() } as never,
        overrideAccess: true,
      })
    }
    expect((await refreshWith(first.refresh_token)).status).toBe(400)
    const revoked = await mcpAuth(second.access_token)
    expect(revoked.challenge).toContain('invalid_token')
  })

  it('disconnects everyone from an app an administrator switches off', async () => {
    const { answer, verifier } = await connect('editor', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const issued = (await (
      await exchange(clientId, redirect, code, verifier)
    ).json()) as typeof tokens

    await payload.updateGlobal({
      slug: MCP_ACCESS_SLUG as never,
      data: { clients: { claude: false } } as never,
      overrideAccess: true,
    })
    const refused = await mcpAuth(issued.access_token)
    expect(refused.challenge).toMatch(/turned off/)
    await payload.updateGlobal({
      slug: MCP_ACCESS_SLUG as never,
      data: { clients: { claude: true } } as never,
      overrideAccess: true,
    })
  })

  it('applies a changed policy to an existing connection', async () => {
    const { answer, verifier } = await connect('editor', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const issued = (await (
      await exchange(clientId, redirect, code, verifier)
    ).json()) as typeof tokens
    await payload.updateGlobal({
      slug: MCP_ACCESS_SLUG as never,
      data: { editors: { tools: ['find'] } } as never,
      overrideAccess: true,
    })
    expect((await mcpAuth(issued.access_token)).settings?.['payload-mcp-tool']).toEqual({
      find: true,
    })
    await payload.updateGlobal({
      slug: MCP_ACCESS_SLUG as never,
      data: { editors: { tools: ['find', 'save_draft'] } } as never,
      overrideAccess: true,
    })
  })

  it('disconnects a person who loses the role', async () => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email: 'leaver@site.example',
        password: 'correct-horse-battery',
        roles: ['editor'],
      } as never,
    })
    cookies['leaver'] =
      (
        await payload.login({
          collection: 'users',
          data: { email: 'leaver@site.example', password: 'correct-horse-battery' },
        })
      ).token ?? ''
    const { answer, verifier } = await connect('leaver', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const issued = (await (
      await exchange(clientId, redirect, code, verifier)
    ).json()) as typeof tokens
    expect((await mcpAuth(issued.access_token)).settings).toBeDefined()

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { roles: ['approver'] } as never,
    })
    const refused = await mcpAuth(issued.access_token)
    expect(refused.challenge).toMatch(/editor or an admin/)
  })

  it('lets a person revoke their own connection and nobody else’s', async () => {
    const { answer, verifier } = await connect('editor', clientId, redirect)
    const code = new URL(answer.redirect ?? '').searchParams.get('code') ?? ''
    const issued = (await (
      await exchange(clientId, redirect, code, verifier)
    ).json()) as typeof tokens
    const { docs } = await payload.find({
      collection: MCP_OAUTH_GRANTS_SLUG as never,
      where: { status: { equals: 'active' }, user: { equals: ids['editor'] } } as never,
      overrideAccess: true,
    })
    const grant = docs[0] as unknown as { id: number }

    const other = await call('POST', `/api/oauth/grants/${grant.id}/revoke`, {
      cookie: cookies['approver'] ?? '',
      origin: ORIGIN,
    })
    expect(other.status).toBe(404)
    const own = await call('POST', `/api/oauth/grants/${grant.id}/revoke`, {
      cookie: cookies['editor'] ?? '',
      origin: ORIGIN,
    })
    expect(own.status).toBe(200)
    expect((await mcpAuth(issued.access_token)).error).toBeDefined()
  })

  it('never returns a token hash through the API, even to an administrator', async () => {
    const response = await call('GET', `/api/${MCP_OAUTH_GRANTS_SLUG}?depth=0`, {
      cookie: cookies['admin'] ?? '',
    })
    const body = (await response.json()) as { docs: Record<string, unknown>[] }
    expect(body.docs.length).toBeGreaterThan(0)
    for (const doc of body.docs) {
      expect(doc).not.toHaveProperty('accessHash')
      expect(doc).not.toHaveProperty('refreshHash')
      expect(doc).not.toHaveProperty('codeHash')
    }
  })

  it('shows an editor only their own connections', async () => {
    const response = await call('GET', `/api/${MCP_OAUTH_GRANTS_SLUG}?depth=0&limit=100`, {
      cookie: cookies['editor'] ?? '',
    })
    const body = (await response.json()) as { docs: { user: unknown }[] }
    expect(body.docs.length).toBeGreaterThan(0)
    expect(body.docs.every((doc) => doc.user === ids['editor'])).toBe(true)
  })
})

describe('Claude Code, by its metadata document', () => {
  it('connects on a loopback callback with any port, without registering', async () => {
    const before = cimdFetches
    const { answer, verifier } = await connect(
      'editor',
      CLAUDE_CODE_CIMD,
      'http://localhost:49152/callback',
    )
    expect(cimdFetches).toBeGreaterThan(before)
    const back = new URL(answer.redirect ?? '')
    expect(back.port).toBe('49152')
    const response = await exchange(
      CLAUDE_CODE_CIMD,
      'http://localhost:49152/callback',
      back.searchParams.get('code') ?? '',
      verifier,
    )
    expect(response.status).toBe(200)
  })

  it('refuses a metadata document this server will not fetch', async () => {
    const response = await call(
      'GET',
      `/api/oauth/authorize?${form({ response_type: 'code', client_id: 'https://127.0.0.1/meta', redirect_uri: 'http://localhost/callback', code_challenge: pkce().challenge, code_challenge_method: 'S256' })}`,
    )
    expect(response.status).toBe(400)
  })
})

describe('API keys', () => {
  it('still work, and are held to the same rule', async () => {
    const editor = await payload.findByID({
      collection: 'users',
      id: ids['editor'] as never,
      depth: 0,
    })
    const approver = await payload.findByID({
      collection: 'users',
      id: ids['approver'] as never,
      depth: 0,
    })
    expect((await mcpAuth('a-plugin-api-key', editor as never)).settings?.user['id']).toBe(
      ids['editor'],
    )
    expect((await mcpAuth('a-plugin-api-key', approver as never)).challenge).toMatch(
      /editor or an admin/,
    )
    expect((await mcpAuth('a-wrong-api-key')).challenge).toContain('invalid_token')
  })
})
