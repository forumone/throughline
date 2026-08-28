import type { z } from 'zod'
import type { Logger } from './index.js'

/**
 * A single tool exposed by a Throughline MCP server.
 */
export interface McpToolDefinition<Input extends z.ZodType = z.ZodType, Output = unknown> {
  /** The tool's name as exposed to the MCP client. */
  name: string
  /** Human-readable description the MCP client uses to decide when to call this tool. */
  description: string
  /** Zod schema for the input; used for validation and for generating the MCP tool schema. */
  inputSchema: Input
  /**
   * The API-key scope a caller must hold, e.g. `'publishing.execute'`.
   *
   * Declared on the consequential tools — the ones that write, publish or
   * decide. A tool with no `requiredScope` is callable by any authenticated
   * key, which is the right default for a read.
   *
   * **Nothing enforces this today.** The per-server JSON-RPC handler that read
   * it is gone, and `@payloadcms/plugin-mcp` gates on per-key checkboxes it
   * generates at config time instead — which this suite cannot fill, because
   * every tool is built at `onInit`. So a key that authenticates reaches every
   * collected tool.
   *
   * Kept, rather than deleted with its enforcer, because this is the tool → scope
   * mapping those checkboxes need: it is the input to restoring gating, not a
   * leftover. Deleting it would mean re-deriving eleven declarations by hand.
   * Tracked as #78.
   */
  requiredScope?: string
  /** Handler invoked with validated input plus per-request context. */
  handler: (input: z.infer<Input>, context: McpToolContext) => Promise<Output>
}

export interface McpToolContext {
  /** The user identified by the API key used for this request. */
  user: AuthenticatedUser | null
  /** The API key's name, for audit logging. */
  apiKeyName: string
  /** The session ID from the MCP client, if provided. */
  sessionId?: string
  /** Request-scoped logger. */
  logger: Logger
}

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  roles: string[]
  groups: string[]
}

/**
 * Optional `_meta` parameters clients may pass alongside consequential tool calls.
 * Consumed by the audit system to capture prompt and reasoning context.
 */
export interface McpMeta {
  userPrompt?: string
  reasoning?: string
  changesSummary?: string
}
