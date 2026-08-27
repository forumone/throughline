import type { McpToolContext } from '@forumone/throughline-plugin-contract'
import type { AuditActor } from '../audit/writer.js'
// `meta.ts`'s zod-inferred shape, not the hand-written interface in
// plugin-contract: the two differ under `exactOptionalPropertyTypes`, and this
// is the one every tool actually holds, having come from `withMeta`.
import type { McpMeta } from './meta.js'

/**
 * The audit fields every tool derives from its request rather than from its
 * arguments: who called, and whatever narrative context the client attached.
 *
 * Spread into an `AuditEventInput` alongside the fields the tool itself knows —
 * `action`, `mcpServer`, `mcpTool`, the target.
 */
export interface AuditContextFields {
  actor: AuditActor
  prompt?: string | undefined
  reasoning?: string | undefined
  changesSummary?: string | undefined
}

/**
 * One answer to "who did this", for every tool in every server.
 *
 * Ten tools built this block by hand and four of them disagreed. Three variants
 * were only untidy — a dropped `userName`, conditional spreads, an assumption
 * that `ctx.user` is non-null. The fourth was wrong: the component tools wrote
 * `type: 'user'` unconditionally, so a call made with an API key and no linked
 * user was recorded as a person. An audit log that cannot tell an agent from an
 * editor is not an audit log, and this is the log the MCP pilot will be judged
 * on.
 *
 * `type` follows the rule `publishing`'s service already used: a call carrying a
 * user is that user's, and one without is the system's. `apiKeyName` rides along
 * either way, because a key acting on behalf of a linked user is still worth
 * naming.
 *
 * `sessionId` is passed through for the first time. The column has existed on
 * the audit collection since it was written and nothing ever filled it; it is
 * what lets somebody reading the log group a whole conversation's writes rather
 * than reading them one at a time.
 */
export function auditContext(ctx: McpToolContext, meta?: McpMeta): AuditContextFields {
  return {
    actor: {
      type: ctx.user ? 'user' : 'system',
      userId: ctx.user?.id,
      userName: ctx.user?.name,
      apiKeyName: ctx.apiKeyName,
      sessionId: ctx.sessionId,
    },
    prompt: meta?.userPrompt,
    reasoning: meta?.reasoning,
    changesSummary: meta?.changesSummary,
  }
}
