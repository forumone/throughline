import type { Endpoint, Payload } from 'payload'
import type { AuditWriter } from '@forumone/throughline-core'
import type { ApprovalsPluginOptions } from '../options.js'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import {
  type ActionTokenAction,
  type VerifyResult,
  verifyActionToken,
} from '../tokens.js'

export interface CreateActionEndpointDeps {
  options: ApprovalsPluginOptions & { tokenSecret: string }
  auditWriter: AuditWriter
}

const DECISION_STATUS_MAP: Record<Exclude<ActionTokenAction, 'discuss'>, string> = {
  approve: 'granted',
  decline: 'declined',
  changes: 'changes-requested',
}

const DECISION_AUDIT_MAP = {
  approve: 'approval.granted',
  decline: 'approval.declined',
  changes: 'approval.changes_requested',
} as const

const ACTION_LABEL: Record<ActionTokenAction, string> = {
  approve: 'Approve',
  decline: 'Decline',
  changes: 'Request changes',
  discuss: 'Start discussion',
}

/**
 * Builds the GET endpoint that handles inline action links from emails.
 * The flow is:
 *   - First request: render a confirmation page so a single misclicked
 *     link can't act on the approval.
 *   - Second request (with `confirm=true`): verify the token wasn't
 *     already consumed and apply the decision.
 *
 * Uses HTML responses (intentionally minimal styling — clients can drop
 * a custom-branded endpoint in front if they want).
 */
export function createActionEndpoint(deps: CreateActionEndpointDeps): Endpoint {
  return {
    path: '/approvals/action',
    method: 'get',
    handler: async (req) => {
      const url = new URL(req.url ?? 'http://localhost')
      const token = url.searchParams.get('token')
      if (!token) return htmlResponse(renderError('Missing action token'), 400)

      const verification = await verifyActionToken(token, deps.options.tokenSecret)
      if (!verification.ok) {
        return htmlResponse(renderError(verification.error), 401)
      }

      const collectionSlug = deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG
      const approval = (await req.payload.findByID({
        collection: collectionSlug,
        id: verification.token.approvalId,
      })) as Record<string, unknown> | null

      if (!approval) return htmlResponse(renderError('Approval not found'), 404)

      const status = String(approval['status'])
      if (status !== 'pending') {
        return htmlResponse(renderInfo(`This request was already ${status}.`))
      }

      const consumed = (approval['consumedTokens'] as string[] | undefined) ?? []
      if (consumed.includes(token)) {
        return htmlResponse(renderError('This action link has already been used'), 400)
      }

      const expiresAtRaw = approval['expiresAt']
      if (
        typeof expiresAtRaw === 'string' &&
        Date.parse(expiresAtRaw) < Date.now()
      ) {
        return htmlResponse(renderInfo('This approval request has expired.'))
      }

      const action = verification.token.action
      const confirm = url.searchParams.get('confirm') === 'true'
      if (!confirm) {
        return htmlResponse(
          renderConfirmation({
            token,
            action,
            targetTitle: stringOrFallback(approval['targetTitle'], 'this document'),
            changesSummary: stringOrFallback(approval['changesSummary'], ''),
          }),
        )
      }

      if (action === 'discuss') {
        // Discuss isn't a decision — surface a message and don't mutate state.
        // C11 listens for the 'approval/discussed' event to thread it into
        // the email reply UX once that lands.
        await deps.options.inngest.send({
          name: 'approval/discussed',
          data: {
            approvalId: verification.token.approvalId,
            approverId: verification.token.approverId,
          },
        })
        await deps.auditWriter({
          actor: { type: 'user', userId: verification.token.approverId, apiKeyName: 'action-token' },
          action: 'approval.discussed',
          mcpServer: 'approvals',
          mcpTool: 'action-endpoint',
          targetCollection: String(approval['targetCollection']),
          targetId: String(approval['targetId']),
          approvalRequestId: verification.token.approvalId,
          success: true,
        })
        return htmlResponse(renderInfo('Thanks — a discussion thread will follow up by email.'))
      }

      const newStatus = DECISION_STATUS_MAP[action]
      const decidedAt = new Date().toISOString()

      await req.payload.update({
        collection: collectionSlug,
        id: verification.token.approvalId,
        data: {
          status: newStatus,
          decidedBy: verification.token.approverId,
          decidedAt,
          consumedTokens: [...consumed, token],
        },
      })

      await deps.options.inngest.send({
        name: 'approval/decided',
        data: {
          approvalId: verification.token.approvalId,
          decision: newStatus,
          decidedBy: verification.token.approverId,
          decidedAt,
          targetCollection: String(approval['targetCollection']),
          targetId: String(approval['targetId']),
        },
      })

      await deps.auditWriter({
        actor: {
          type: 'user',
          userId: verification.token.approverId,
          apiKeyName: 'action-token',
        },
        action: DECISION_AUDIT_MAP[action],
        mcpServer: 'approvals',
        mcpTool: 'action-endpoint',
        targetCollection: String(approval['targetCollection']),
        targetId: String(approval['targetId']),
        targetTitle: stringOrFallback(approval['targetTitle'], String(approval['targetId'])),
        approvalRequestId: verification.token.approvalId,
        success: true,
      })

      return htmlResponse(
        renderSuccess(
          ACTION_LABEL[action],
          stringOrFallback(approval['targetTitle'], 'this document'),
        ),
      )
    },
  }
}

/** Lower-level helper exported for test consumers and custom action endpoints. */
export type ActionVerification = VerifyResult

export async function previewVerification(
  token: string,
  payload: Payload,
  options: ApprovalsPluginOptions & { tokenSecret: string },
): Promise<{ verification: VerifyResult; approval: Record<string, unknown> | null }> {
  const verification = await verifyActionToken(token, options.tokenSecret)
  if (!verification.ok) return { verification, approval: null }
  const approval = (await payload.findByID({
    collection: options.collectionSlug ?? DEFAULT_APPROVALS_SLUG,
    id: verification.token.approvalId,
  })) as Record<string, unknown> | null
  return { verification, approval }
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function renderConfirmation(args: {
  token: string
  action: ActionTokenAction
  targetTitle: string
  changesSummary: string
}): string {
  const label = ACTION_LABEL[args.action]
  const summary = args.changesSummary
    ? `<p><strong>What's changing:</strong> ${escape(args.changesSummary)}</p>`
    : ''
  return htmlPage(`
    <h1>${escape(label)}</h1>
    <p>You're about to <strong>${escape(label.toLowerCase())}</strong> the request for <em>${escape(args.targetTitle)}</em>.</p>
    ${summary}
    <form method="GET">
      <input type="hidden" name="token" value="${escape(args.token)}" />
      <input type="hidden" name="confirm" value="true" />
      <button type="submit">Confirm: ${escape(label)}</button>
    </form>
  `)
}

function renderSuccess(label: string, title: string): string {
  return htmlPage(`<h1>${escape(label)}</h1><p>Your decision on <em>${escape(title)}</em> has been recorded.</p>`)
}

function renderError(message: string): string {
  return htmlPage(`<h1>Action could not be completed</h1><p>${escape(message)}</p>`)
}

function renderInfo(message: string): string {
  return htmlPage(`<h1>Notice</h1><p>${escape(message)}</p>`)
}

function htmlPage(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Approval action</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 3rem auto; padding: 0 1rem; color: #18181b; line-height: 1.6; }
    h1 { font-size: 1.5rem; }
    button { background: #18181b; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.25rem; font-size: 1rem; cursor: pointer; }
    em { font-style: italic; }
  </style>
</head>
<body>${body}</body>
</html>`
}

function escape(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}
