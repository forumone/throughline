import type { AuthenticatedUser } from './mcp.js'

/**
 * Validates an incoming MCP request and resolves the caller's identity.
 * Plugins accept an optional `authenticator` option; if omitted they fall
 * back to the default Payload bearer-token authenticator.
 */
export interface McpAuthenticator {
  /**
   * Inspects the `Authorization` header on the request and returns an
   * {@link McpAuthResult} if the token is valid, or `null` otherwise.
   */
  authenticate(request: Request): Promise<McpAuthResult | null>
}

export interface McpAuthResult {
  user: AuthenticatedUser
  apiKeyName: string
  apiKeyId: string
  /**
   * What this key was granted, from the key record. A tool declaring a
   * `requiredScope` is refused — and hidden from `tools/list` — unless it is
   * named here.
   *
   * Optional so an authenticator predating scopes still type-checks; absent is
   * read as "no scopes", which refuses every scoped tool rather than allowing
   * them. A key that cannot say what it may do may not do the consequential
   * things.
   */
  scopes?: string[]
}
