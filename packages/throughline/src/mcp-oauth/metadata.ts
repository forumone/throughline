import type { McpOAuthRuntime } from './runtime.js'

/*
The two discovery documents, and the exact values clients check.

A client finds everything from the `401` on `/api/mcp`: its `WWW-Authenticate`
points at the protected-resource metadata (RFC 9728), which names this site as
the authorization server, whose own metadata (RFC 8414) lists the endpoints.

What each client is strict about, from their documentation:

- Claude uses only the **first** `authorization_servers` entry, and requires
  `resource` to equal the URL the person typed, path included.
- Claude picks a client ID metadata document (CIMD) only when **both**
  `client_id_metadata_document_supported` and `"none"` among the token
  endpoint's auth methods are present; otherwise it registers (DCR).
- ChatGPT uses its stable callback only when the authorization response carries
  `iss` (RFC 9207), and compares it to `issuer` byte for byte.
- Both append `offline_access` to the scopes when it is listed, which is what
  gets them a refresh token.
*/

export const MCP_SCOPE = 'mcp'

export function authorizationServerMetadata(runtime: McpOAuthRuntime) {
  return {
    issuer: runtime.issuer,
    authorization_endpoint: runtime.endpoint('authorize'),
    token_endpoint: runtime.endpoint('token'),
    registration_endpoint: runtime.endpoint('register'),
    revocation_endpoint: runtime.endpoint('revoke'),
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [MCP_SCOPE, 'offline_access'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

export function protectedResourceMetadata(runtime: McpOAuthRuntime) {
  return {
    resource: runtime.resource,
    authorization_servers: [runtime.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [MCP_SCOPE],
    resource_name: runtime.serverName,
  }
}

/** Where the protected-resource metadata is served. */
export function protectedResourceMetadataUrl(runtime: McpOAuthRuntime): string {
  return `${runtime.origin}/.well-known/oauth-protected-resource${new URL(runtime.resource).pathname}`
}

/**
 * Rewrites for `next.config`, so the well-known paths at the root reach the
 * endpoints Payload serves under its API route. Payload only routes under
 * `/api`; RFC 8414 and RFC 9728 put discovery at `/.well-known`.
 *
 * ```js
 * async rewrites() {
 *   return mcpOAuthRewrites()
 * }
 * ```
 */
export function mcpOAuthRewrites({ apiRoute = '/api' }: { apiRoute?: string } = {}) {
  const api = apiRoute.replace(/\/+$/, '')
  return [
    {
      source: '/.well-known/oauth-protected-resource',
      destination: `${api}/oauth/protected-resource`,
    },
    {
      source: '/.well-known/oauth-protected-resource/:path*',
      destination: `${api}/oauth/protected-resource`,
    },
    {
      source: '/.well-known/oauth-authorization-server',
      destination: `${api}/oauth/metadata`,
    },
    {
      source: '/.well-known/oauth-authorization-server/:path*',
      destination: `${api}/oauth/metadata`,
    },
  ]
}
