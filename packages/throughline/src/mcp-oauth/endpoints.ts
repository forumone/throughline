import type { Endpoint, PayloadRequest } from 'payload'
import type { FetchLike } from './cimd.js'
import { clientKindFor, redirectRegistered } from './clients.js'
import { signedInPerson } from './collections.js'
import { isCodeChallenge, seal, unseal } from './crypto.js'
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js'
import { keys, MCP_OAUTH_GRANTS_SLUG, readPolicy, type McpOAuthRuntime } from './runtime.js'
import {
  createPendingGrant,
  exchangeCode,
  refresh,
  registerClient,
  resolveClient,
  revokeGrant,
  revokeToken,
  type PendingRequest,
} from './store.js'

/*
The authorization server, as Payload endpoints under `/api/oauth`.

| Endpoint | Who calls it |
| --- | --- |
| `GET  metadata`, `GET protected-resource` | the app, discovering (rewritten from `/.well-known`) |
| `POST register` | the app, registering itself (RFC 7591) |
| `GET  authorize` | the person's browser, sent by the app |
| `POST consent` | the consent screen, signed in |
| `POST token` | the app: a code or a refresh token for tokens |
| `POST revoke` | the app, disconnecting (RFC 7009) |
| `POST grants/:id/revoke` | the Connect MCP page, signed in |

The app-facing ones answer any origin, because a browser-based MCP client calls
them cross-origin and none of them takes a cookie. The two a signed-in person
calls refuse a cross-origin request outright: they act on the session cookie, so
an `Origin` that is not this site is a forgery.
*/

const APP_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-max-age': '86400',
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function appJson(body: unknown, status = 200): Response {
  return json(body, status, { ...APP_CORS, 'cache-control': 'no-store', pragma: 'no-cache' })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/*
An error the browser shows rather than one sent back to the app. RFC 6749
§4.1.2.1: when the client or its redirect cannot be trusted, the server must not
redirect — that would make it an open redirector for anybody who can write a
URL. So these are a page, with a way back to the instructions.
*/
function errorPage(
  runtime: McpOAuthRuntime,
  adminRoute: string,
  title: string,
  message: string,
): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:10vh auto;padding:0 1rem;color:#1a1a1a}h1{font-size:1.4rem}a{color:inherit}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
<p><a href="${escapeHtml(`${adminRoute}${runtime.connectPath}`)}">How to connect an app to ${escapeHtml(runtime.serverName)}</a></p></body></html>`
  return new Response(html, {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** `redirectUri` with the response parameters added, `iss` always among them. */
export function withParams(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri)
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value)
  }
  return url.toString()
}

function sameResource(given: string, ours: string): boolean {
  return given.replace(/\/+$/, '') === ours.replace(/\/+$/, '')
}

async function readParams(req: PayloadRequest): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? ''
  const text = typeof req.text === 'function' ? await req.text() : ''
  if (type.includes('application/json')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(text))
}

async function readJson(req: PayloadRequest): Promise<Record<string, unknown> | undefined> {
  try {
    const text = typeof req.text === 'function' ? await req.text() : ''
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** True when a cookie-authenticated request came from this site. */
function sameOrigin(req: PayloadRequest, runtime: McpOAuthRuntime): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  if (origin === runtime.origin) return true
  try {
    return origin === new URL(req.url ?? '').origin
  } catch {
    return false
  }
}

function adminRouteOf(req: PayloadRequest): string {
  return req.payload.config.routes?.admin ?? '/admin'
}

export interface EndpointOptions {
  /** For tests: how a client metadata document is fetched. */
  fetch?: FetchLike
}

export function oauthEndpoints(
  runtime: McpOAuthRuntime,
  options: EndpointOptions = {},
): Endpoint[] {
  const preflight = (path: string): Endpoint => ({
    path,
    method: 'options',
    handler: () => new Response(null, { status: 204, headers: APP_CORS }),
  })

  return [
    {
      path: '/oauth/metadata',
      method: 'get',
      handler: () =>
        json(authorizationServerMetadata(runtime), 200, {
          ...APP_CORS,
          'cache-control': 'public, max-age=300',
        }),
    },
    {
      path: '/oauth/protected-resource',
      method: 'get',
      handler: () =>
        json(protectedResourceMetadata(runtime), 200, {
          ...APP_CORS,
          'cache-control': 'public, max-age=300',
        }),
    },
    preflight('/oauth/metadata'),
    preflight('/oauth/protected-resource'),
    preflight('/oauth/register'),
    preflight('/oauth/token'),
    preflight('/oauth/revoke'),

    {
      path: '/oauth/register',
      method: 'post',
      handler: async (req) => {
        const body = await readJson(req)
        if (!body) {
          return appJson(
            {
              error: 'invalid_client_metadata',
              error_description: 'The body must be a JSON object.',
            },
            400,
          )
        }
        const redirectUris = body['redirect_uris']
        if (!Array.isArray(redirectUris)) {
          return appJson(
            { error: 'invalid_redirect_uri', error_description: 'redirect_uris is required.' },
            400,
          )
        }
        const grantTypes = body['grant_types']
        if (
          Array.isArray(grantTypes) &&
          grantTypes.some((each) => each !== 'authorization_code' && each !== 'refresh_token')
        ) {
          return appJson(
            {
              error: 'invalid_client_metadata',
              error_description: 'Only authorization_code and refresh_token are supported.',
            },
            400,
          )
        }
        const policy = await readPolicy(req.payload, runtime)
        const name = typeof body['client_name'] === 'string' ? body['client_name'] : undefined
        const client = await registerClient(req.payload, policy, {
          redirectUris,
          ...(name ? { name } : {}),
        })
        if ('error' in client) {
          return appJson({ error: 'invalid_redirect_uri', error_description: client.error }, 400)
        }
        return appJson(
          {
            client_id: client.clientId,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            ...(client.name ? { client_name: client.name } : {}),
            redirect_uris: client.redirectUris,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          },
          201,
        )
      },
    },

    {
      path: '/oauth/authorize',
      method: 'get',
      handler: async (req) => {
        const adminRoute = adminRouteOf(req)
        const params = new URL(req.url ?? '', runtime.origin).searchParams
        const policy = await readPolicy(req.payload, runtime)

        const client = await resolveClient(
          req.payload,
          policy,
          params.get('client_id'),
          options.fetch,
        )
        if ('error' in client)
          return errorPage(runtime, adminRoute, 'This app can’t connect', client.error)

        const requested = params.get('redirect_uri') ?? undefined
        const redirectUri =
          requested ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined)
        if (!redirectUri || !redirectRegistered(redirectUri, client.redirectUris)) {
          return errorPage(
            runtime,
            adminRoute,
            'This app can’t connect',
            'The address it asked to return to is not one it registered.',
          )
        }
        if (clientKindFor(redirectUri, (kind) => policy.clients[kind]) !== client.kind) {
          return errorPage(
            runtime,
            adminRoute,
            'This app can’t connect',
            'Connections from this app are turned off on this site.',
          )
        }

        // From here the redirect is trusted, so errors go back to the app.
        const state = params.get('state') ?? undefined
        const back = (error: string, description: string) =>
          new Response(null, {
            status: 302,
            headers: {
              location: withParams(redirectUri, {
                error,
                error_description: description,
                state,
                iss: runtime.issuer,
              }),
              'cache-control': 'no-store',
            },
          })

        if (params.get('response_type') !== 'code') {
          return back('unsupported_response_type', 'Only response_type=code is supported.')
        }
        const challenge = params.get('code_challenge')
        if (!isCodeChallenge(challenge) || params.get('code_challenge_method') !== 'S256') {
          return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.')
        }
        const resource = params.get('resource')
        if (resource && !sameResource(resource, runtime.resource)) {
          return back('invalid_target', `This server issues tokens for ${runtime.resource} only.`)
        }

        const request: PendingRequest = {
          clientId: client.clientId,
          redirectUri,
          codeChallenge: challenge,
          ...(state !== undefined ? { state } : {}),
        }
        const sealed = seal(keys(req.payload).request, request, 15 * 60)
        return new Response(null, {
          status: 302,
          headers: {
            location: `${adminRoute}${runtime.connectPath}/authorize?request=${encodeURIComponent(sealed)}`,
            'cache-control': 'no-store',
          },
        })
      },
    },

    {
      path: '/oauth/consent',
      method: 'post',
      handler: async (req) => {
        const user = signedInPerson(req)
        if (!user) return json({ error: 'Sign in first.' }, 401)
        if (!sameOrigin(req, runtime)) return json({ error: 'Cross-origin request refused.' }, 403)

        const body = await readJson(req)
        const request = unseal<PendingRequest>(keys(req.payload).request, body?.['request'])
        if (!request) {
          return json({ error: 'This sign-in request has expired. Start again from the app.' }, 400)
        }
        const policy = await readPolicy(req.payload, runtime)
        const client = await resolveClient(req.payload, policy, request.clientId, options.fetch)
        if ('error' in client) return json({ error: client.error }, 400)
        if (!redirectRegistered(request.redirectUri, client.redirectUris)) {
          return json(
            { error: 'This app’s registration has changed. Start again from the app.' },
            400,
          )
        }

        if (body?.['decision'] !== 'allow') {
          return json({
            redirect: withParams(request.redirectUri, {
              error: 'access_denied',
              error_description: 'The person declined.',
              state: request.state,
              iss: runtime.issuer,
            }),
          })
        }

        const verdict = runtime.eligible(user)
        if (verdict !== true) return json({ error: verdict }, 403)

        const code = await createPendingGrant(req.payload, user, client, request)
        return json({
          redirect: withParams(request.redirectUri, {
            code,
            state: request.state,
            iss: runtime.issuer,
          }),
        })
      },
    },

    {
      path: '/oauth/token',
      method: 'post',
      handler: async (req) => {
        const params = await readParams(req)
        if (params['resource'] && !sameResource(params['resource'], runtime.resource)) {
          return appJson(
            {
              error: 'invalid_target',
              error_description: `This server issues tokens for ${runtime.resource} only.`,
            },
            400,
          )
        }
        const policy = await readPolicy(req.payload, runtime)
        const grantType = params['grant_type']

        if (grantType === 'authorization_code') {
          const result = await exchangeCode(req.payload, runtime, policy, {
            ...(params['code'] ? { code: params['code'] } : {}),
            ...(params['client_id'] ? { clientId: params['client_id'] } : {}),
            ...(params['redirect_uri'] ? { redirectUri: params['redirect_uri'] } : {}),
            ...(params['code_verifier'] ? { codeVerifier: params['code_verifier'] } : {}),
          })
          return appJson(result, 'error' in result ? 400 : 200)
        }
        if (grantType === 'refresh_token') {
          const result = await refresh(req.payload, runtime, policy, {
            ...(params['refresh_token'] ? { refreshToken: params['refresh_token'] } : {}),
            ...(params['client_id'] ? { clientId: params['client_id'] } : {}),
          })
          return appJson(result, 'error' in result ? 400 : 200)
        }
        return appJson(
          {
            error: 'unsupported_grant_type',
            error_description: 'Use authorization_code or refresh_token.',
          },
          400,
        )
      },
    },

    {
      path: '/oauth/revoke',
      method: 'post',
      handler: async (req) => {
        const params = await readParams(req)
        await revokeToken(req.payload, params['token'])
        return new Response(null, {
          status: 200,
          headers: { ...APP_CORS, 'cache-control': 'no-store' },
        })
      },
    },

    {
      path: '/oauth/grants/:id/revoke',
      method: 'post',
      handler: async (req) => {
        const user = signedInPerson(req)
        if (!user) return json({ error: 'Sign in first.' }, 401)
        if (!sameOrigin(req, runtime)) return json({ error: 'Cross-origin request refused.' }, 403)

        const id = req.routeParams?.['id']
        const grant = (await req.payload.findByID({
          collection: MCP_OAUTH_GRANTS_SLUG as never,
          id: id as never,
          depth: 0,
          overrideAccess: true,
          disableErrors: true,
        })) as unknown as Record<string, unknown> | null
        const admin = runtime.isAdmin(user)
        if (!grant || (!admin && String(grant['user']) !== String(user['id']))) {
          return json({ error: 'No such connection.' }, 404)
        }
        if (grant['status'] !== 'revoked') {
          const own = String(grant['user']) === String(user['id'])
          await revokeGrant(
            req.payload,
            grant,
            own ? 'disconnected by its owner' : 'revoked by an administrator',
          )
        }
        return json({ ok: true })
      },
    },
  ]
}
