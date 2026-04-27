import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import type { Logger } from '@forumone/throughline-plugin-contract'
import type { AuditAction, AuditMcpServer } from './types.js'

export interface AuditActor {
  type: 'user' | 'system' | 'integration'
  userId?: string | undefined
  userName?: string | undefined
  apiKeyName?: string | undefined
  apiKeyId?: string | undefined
  sessionId?: string | undefined
}

export interface AuditEventInput {
  actor: AuditActor
  action: AuditAction
  mcpServer: AuditMcpServer
  mcpTool: string
  targetCollection?: string | undefined
  targetId?: string | undefined
  targetTitle?: string | undefined
  prompt?: string | undefined
  reasoning?: string | undefined
  changesSummary?: string | undefined
  summary?: string | undefined
  diff?: Record<string, { before: unknown; after: unknown }> | null | undefined
  success?: boolean | undefined
  errorMessage?: string | undefined
  approvalRequestId?: string | undefined
  integrationId?: string | undefined
}

export interface AuditWriterOptions {
  payload: Payload
  inngest?: Inngest | undefined
  collectionSlug?: string | undefined
  logger?: Logger | undefined
}

export type AuditWriter = (event: AuditEventInput) => Promise<void>

/**
 * Returns a fire-and-forget audit writer. The writer never throws — failures
 * log via `options.logger` (or `console`). Audit failures must not break
 * the originating action.
 *
 * If `inngest` is provided the writer also fires an `audit/event.recorded`
 * event so subscribers (email, integrations, healthchecks) can react.
 */
export function createAuditWriter(options: AuditWriterOptions): AuditWriter {
  const { payload, inngest, collectionSlug = 'audit-events', logger } = options

  return async function recordAuditEvent(event: AuditEventInput): Promise<void> {
    try {
      const summary = event.summary ?? generateSummary(event)

      const created = await payload.create({
        collection: collectionSlug,
        data: stripUndefined({
          createdAt: new Date().toISOString(),
          actor: stripUndefined({ ...event.actor }),
          action: event.action,
          mcpServer: event.mcpServer,
          mcpTool: event.mcpTool,
          targetCollection: event.targetCollection,
          targetId: event.targetId,
          targetTitle: event.targetTitle,
          prompt: event.prompt,
          reasoning: event.reasoning,
          changesSummary: event.changesSummary,
          summary,
          diff: event.diff ?? null,
          success: event.success ?? true,
          errorMessage: event.errorMessage,
          approvalRequestId: event.approvalRequestId,
          integrationId: event.integrationId,
        }),
      })

      if (inngest) {
        try {
          await inngest.send({
            name: 'audit/event.recorded',
            data: stripUndefined({
              auditEventId: String(created.id),
              action: event.action,
              actorId: event.actor.userId,
              targetCollection: event.targetCollection,
              targetId: event.targetId,
              approvalRequestId: event.approvalRequestId,
              integrationId: event.integrationId,
            }),
          })
        } catch (eventError) {
          logger?.warn('Audit Inngest event send failed', { error: String(eventError) })
        }
      }
    } catch (writeError) {
      logger?.error('Audit event write failed', {
        error: String(writeError),
        action: event.action,
        targetCollection: event.targetCollection,
        targetId: event.targetId,
      })
      // Intentionally swallowed: never let audit failures break the original action.
    }
  }
}

const SUMMARY_TEMPLATES: Partial<Record<AuditAction, (e: AuditEventInput) => string>> = {
  'content.update': (e) => `Updated ${e.targetTitle ?? e.targetId ?? '(unknown)'} in ${e.targetCollection ?? '(unknown)'}`,
  'content.create': (e) => `Created ${e.targetTitle ?? e.targetId ?? '(unknown)'} in ${e.targetCollection ?? '(unknown)'}`,
  'content.delete': (e) => `Deleted ${e.targetTitle ?? e.targetId ?? '(unknown)'} from ${e.targetCollection ?? '(unknown)'}`,
  'content.find': (e) => `Queried ${e.targetCollection ?? '(unknown)'}`,
  'design.suggest': (e) =>
    `Searched for components matching: ${e.prompt?.slice(0, 80) ?? 'an intent'}`,
  'design.validate': () => 'Validated a composition',
  'design.get_contract': (e) => `Fetched contract for ${e.targetTitle ?? '(a component)'}`,
  'publishing.publish': (e) => `Published ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'publishing.unpublish': (e) => `Unpublished ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'publishing.schedule': (e) => `Scheduled publish for ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'publishing.rollback': (e) => `Rolled back ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'approval.requested': (e) => `Requested approval for ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'approval.granted': (e) => `Granted approval for ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'approval.declined': (e) => `Declined approval for ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'approval.expired': (e) => `Approval expired for ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'form.submission_received': (e) =>
    `Form submission received for ${e.targetTitle ?? e.targetId ?? '(unknown)'}`,
  'integration.synced': (e) => `Synced ${e.integrationId ?? '(unknown integration)'}`,
  'integration.failed': (e) => `Integration failed: ${e.integrationId ?? '(unknown integration)'}`,
}

function generateSummary(event: AuditEventInput): string {
  const template = SUMMARY_TEMPLATES[event.action]
  if (template) return template(event)
  return `${event.action} (${event.mcpServer}:${event.mcpTool})`
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}
