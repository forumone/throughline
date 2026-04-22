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
