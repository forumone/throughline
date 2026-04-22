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
}
