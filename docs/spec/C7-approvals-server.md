# Phase C7 — Approvals Server

## Goal

Build `@forumone/claude-cms-approvals` — the workflow and conversational approval layer. Marketers request approval via Claude; approvers receive notifications (wired in C11); decisions flow back through events; the Publishing Server's approval step checks for granted approvals via the resolver this package exposes. Provides collection schema, MCP tools, HMAC action token handling, and the approval resolver that Publishing consumes.

## Prerequisites

- C4 complete; core plumbing with audit log
- C6 complete; Publishing Server defines `ApprovalResolver` interface this plugin satisfies

## Context

Approvals are the governance loop. Without them, every Claude-driven publish is final the moment Claude acts. With them, high-stakes content gets human review before going live. The model is three-tier:

**Request** — the marketer asks Claude to request approval. Claude provides a `changesSummary` explaining what's changing and why. The Approvals Server creates a record, resolves approvers from group membership, and fires an event that triggers notifications (C11 handles the actual sending).

**Decide** — approvers receive email (or Teams in Phase 2) with inline action buttons. Clicking "Approve" hits the action endpoint, which validates an HMAC-signed token and records the decision. Approvers can also respond through Claude directly ("Claude, approve Sarah's homepage request").

**Consume** — the Publishing Server's approval step calls this plugin's resolver to check for an active granted approval. If one exists for the current document version, publishing proceeds.

Key architectural points:

- **First-decision-wins in Phase 1.** Multi-party approvals (legal AND communications required) are deferred to Phase 2. Phase 1 handles "any one approver from the configured groups" — which covers the most common case cleanly.
- **Approvals are tied to document versions.** An approval granted against one draft doesn't automatically apply to a subsequent edit. The resolver checks version match to prevent "approved draft silently modified" scenarios.
- **Action tokens are single-use.** HMAC-signed with a 14-day validity window. Once an approver decides, the token is consumed; reusing it returns an error.
- **Group resolution is configurable.** Clients define what "editorial" or "legal" means — which users belong to which group — via a resolver function. Core doesn't hardcode group membership logic.

## Tasks

### C7.1 — Scaffold the package

```
packages/approvals/
├── src/
│   ├── plugin.ts
│   ├── options.ts
│   ├── collection.ts
│   ├── tokens.ts
│   ├── resolver.ts
│   ├── tools/
│   │   ├── request-approval.ts
│   │   ├── respond-to-approval.ts
│   │   ├── get-approval-status.ts
│   │   ├── list-pending-approvals.ts
│   │   ├── list-my-requests.ts
│   │   └── index.ts
│   ├── endpoints/
│   │   └── action.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-approvals",
  "version": "0.1.0",
  "description": "Conversational approval workflow server for the Claude-First CMS framework.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "peerDependencies": {
    "payload": "^3.0.0",
    "inngest": "^3.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-core": "workspace:*",
    "@forumone/claude-cms-plugin-contract": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "inngest": "^3.0.0",
    "payload": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### C7.2 — Define the plugin options

`src/options.ts`:

```typescript
import type { BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import type { Inngest } from 'inngest'

export interface ApproverGroup {
  /** Group slug, referenced by the policy.approverGroup field on documents. */
  slug: string
  /** Human-readable group name. */
  name: string
  /** Optional description shown in the admin. */
  description?: string
}

export interface GroupResolver {
  /**
   * Given a list of group slugs, return the users in those groups. Each user
   * needs an id and email at minimum; name is used in notifications if present.
   */
  resolveUsers: (groupSlugs: string[]) => Promise<Array<{ id: string; email: string; name?: string }>>
}

export interface ApprovalsPluginOptions extends BaseCorePluginOptions {
  /** The approver groups defined for this deployment. */
  groups: ApproverGroup[]
  /** Resolver that maps group slugs to users. Required. */
  groupResolver: GroupResolver
  /** Inngest client for firing approval events. Required. */
  inngest: Inngest
  /** HMAC signing secret for action tokens. Read from APPROVAL_TOKEN_SECRET env var if not provided. */
  tokenSecret?: string
  /** Days before a pending approval expires. Default: 7. */
  expirationDays?: number
  /** Override the approvals collection slug. Default: 'approvals'. */
  collectionSlug?: string
  /** URL prefix for action endpoints. Used to build inline action URLs. Defaults to process.env.NEXT_PUBLIC_SERVER_URL. */
  publicUrl?: string
}

export function validateOptions(options: ApprovalsPluginOptions): ApprovalsPluginOptions {
  if (!options.groups || options.groups.length === 0) {
    throw new Error('approvalsPlugin requires at least one group in options.groups')
  }
  if (!options.groupResolver) {
    throw new Error('approvalsPlugin requires a groupResolver in options')
  }
  if (!options.inngest) {
    throw new Error('approvalsPlugin requires an Inngest client')
  }
  const secret = options.tokenSecret ?? process.env.APPROVAL_TOKEN_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'approvalsPlugin requires tokenSecret in options or APPROVAL_TOKEN_SECRET env var (32+ characters)',
    )
  }
  return options
}
```

### C7.3 — Build the collection

`src/collection.ts`:

```typescript
import type { CollectionConfig } from 'payload'

export interface CreateApprovalsCollectionOptions {
  slug?: string
  usersSlug?: string
  groupSlugs: string[]
}

export function createApprovalsCollection(options: CreateApprovalsCollectionOptions): CollectionConfig {
  const slug = options.slug ?? 'approvals'
  const usersSlug = options.usersSlug ?? 'users'

  return {
    slug,
    admin: {
      useAsTitle: 'targetTitle',
      defaultColumns: ['targetTitle', 'status', 'requestedBy', 'requestedAt', 'expiresAt'],
      description: 'Approval workflow state. Read-only through the admin; modifications happen via the Approvals Server.',
    },
    access: {
      read: ({ req }) => {
        const roles = (req.user?.roles as string[] | undefined) ?? []
        return roles.includes('admin') || roles.includes('editor') || roles.includes('approver')
      },
      create: () => false, // system-only
      update: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
      delete: () => false,
    },
    fields: [
      // Target
      { name: 'targetCollection', type: 'text', required: true },
      { name: 'targetId', type: 'text', required: true },
      { name: 'targetTitle', type: 'text', required: true },
      { name: 'targetVersion', type: 'text', required: true, admin: { description: 'Version ID at request time.' } },
      { name: 'previewUrl', type: 'text', required: true },

      // Request
      { name: 'requestedBy', type: 'relationship', relationTo: usersSlug, required: true },
      { name: 'requestedAt', type: 'date', required: true, defaultValue: () => new Date().toISOString() },
      { name: 'requestReason', type: 'textarea' },
      { name: 'changesSummary', type: 'textarea', required: true },
      {
        name: 'approverGroups',
        type: 'select',
        hasMany: true,
        required: true,
        options: options.groupSlugs.map((s) => ({ label: s, value: s })),
      },

      // Decision
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'pending',
        options: [
          { label: 'Pending', value: 'pending' },
          { label: 'Granted', value: 'granted' },
          { label: 'Declined', value: 'declined' },
          { label: 'Changes requested', value: 'changes-requested' },
          { label: 'Expired', value: 'expired' },
        ],
      },
      { name: 'decidedBy', type: 'relationship', relationTo: usersSlug },
      { name: 'decidedAt', type: 'date' },
      { name: 'decisionNotes', type: 'textarea' },

      // Workflow state
      { name: 'notifiedApprovers', type: 'json', defaultValue: [] },
      { name: 'expiresAt', type: 'date', required: true },
      {
        name: 'consumedTokens',
        type: 'json',
        defaultValue: [],
        admin: { description: 'Track which action tokens have been consumed to prevent replay.' },
      },
    ],
    indexes: [
      { fields: ['targetCollection', 'targetId', 'status'] },
      { fields: ['status', 'expiresAt'] },
      { fields: ['requestedBy', 'requestedAt'] },
    ],
  }
}
```

### C7.4 — Build the HMAC token system

`src/tokens.ts`:

```typescript
export interface ActionToken {
  approvalId: string
  action: 'approve' | 'decline' | 'changes' | 'discuss'
  approverId: string
  issuedAt: number
}

export async function generateActionToken(token: ActionToken, secret: string): Promise<string> {
  const payload = `${token.approvalId}:${token.action}:${token.approverId}:${token.issuedAt}`
  const signature = await hmacSign(payload, secret)
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

export async function verifyActionToken(
  encodedToken: string,
  secret: string,
  options: { maxAgeMs?: number } = {},
): Promise<ActionToken | { error: string }> {
  try {
    const decoded = Buffer.from(encodedToken, 'base64url').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length !== 5) return { error: 'Invalid token format' }

    const [approvalId, action, approverId, issuedAtStr, providedSignature] = parts
    if (!approvalId || !action || !approverId || !issuedAtStr || !providedSignature) {
      return { error: 'Invalid token format' }
    }

    const issuedAt = parseInt(issuedAtStr, 10)
    if (isNaN(issuedAt)) return { error: 'Invalid token timestamp' }

    const payload = `${approvalId}:${action}:${approverId}:${issuedAt}`
    const expectedSignature = await hmacSign(payload, secret)

    if (!constantTimeEqual(providedSignature, expectedSignature)) {
      return { error: 'Invalid token signature' }
    }

    const maxAge = options.maxAgeMs ?? 14 * 24 * 60 * 60 * 1000
    if (Date.now() - issuedAt > maxAge) {
      return { error: 'Token has expired' }
    }

    if (!['approve', 'decline', 'changes', 'discuss'].includes(action)) {
      return { error: 'Invalid action' }
    }

    return { approvalId, action: action as ActionToken['action'], approverId, issuedAt }
  } catch {
    return { error: 'Token decode failed' }
  }
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function buildActionUrl(publicUrl: string, token: string): string {
  const base = publicUrl.replace(/\/$/, '')
  return `${base}/api/approvals/action?token=${encodeURIComponent(token)}`
}
```

### C7.5 — Build the approval resolver

`src/resolver.ts`:

```typescript
import type { Payload } from 'payload'
import type { ApprovalResolver, ActiveApproval } from '@forumone/claude-cms-publishing'

export interface CreateResolverOptions {
  payload: Payload
  collectionSlug?: string
}

/**
 * Creates the resolver that the Publishing Server consumes to check for
 * active granted approvals.
 */
export function createApprovalResolver(options: CreateResolverOptions): ApprovalResolver {
  const { payload, collectionSlug = 'approvals' } = options

  return {
    async getActiveApproval(collection, id, version) {
      const result = await payload.find({
        collection: collectionSlug,
        where: {
          and: [
            { targetCollection: { equals: collection } },
            { targetId: { equals: id } },
            { targetVersion: { equals: version } },
            { status: { equals: 'granted' } },
          ],
        },
        limit: 1,
        sort: '-decidedAt',
      })

      const approval = result.docs[0]
      if (!approval) return null

      return {
        id: String(approval.id),
        grantedAt: String(approval.decidedAt),
        grantedBy: String((approval.decidedBy as { id?: string })?.id ?? approval.decidedBy),
        version: String(approval.targetVersion),
      } satisfies ActiveApproval
    },
  }
}
```

### C7.6 — Build the MCP tools

`src/tools/request-approval.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta, getAuditWriter, generateId } from '@forumone/claude-cms-core'
import type { Payload } from 'payload'
import type { ApprovalsPluginOptions } from '../options'
import { generateActionToken, buildActionUrl } from '../tokens'

export function createRequestApprovalTool(deps: {
  payload: Payload
  options: ApprovalsPluginOptions
}): McpToolDefinition {
  return {
    name: 'request_approval',
    description:
      "Kicks off the approval workflow for a document that requires approval before publishing. Provide a clear changesSummary explaining what changed and why. Approvers receive notifications with this summary and action buttons. Returns the approval ID and the list of approvers who were notified.",
    inputSchema: withMeta({
      collection: z.string(),
      id: z.string(),
      changesSummary: z.string().min(20).describe('Clear description of what is changing, for approvers to review'),
      requestReason: z.string().optional().describe('Optional additional context about why this change is being made'),
      approverGroups: z.array(z.string()).min(1).describe('Which approver groups to notify'),
    }),
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return { error: 'Approval requests must be made by authenticated users' }
      }

      // Validate groups are configured
      const validGroups = new Set(deps.options.groups.map((g) => g.slug))
      const invalidGroups = input.approverGroups.filter((g) => !validGroups.has(g))
      if (invalidGroups.length > 0) {
        return { error: `Unknown approver groups: ${invalidGroups.join(', ')}` }
      }

      // Load document to get the current version and title
      const document = await deps.payload.findByID({
        collection: input.collection,
        id: input.id,
        draft: true,
      })
      if (!document) return { error: 'Document not found' }

      const targetVersion = String(document.updatedAt ?? document.id)
      const targetTitle = String(document.title ?? input.id)
      const previewUrl = buildPreviewUrl(deps.options, input.collection, String(document.slug ?? input.id))

      // Resolve approvers
      const approvers = await deps.options.groupResolver.resolveUsers(input.approverGroups)
      if (approvers.length === 0) {
        return { error: `No approvers found in groups: ${input.approverGroups.join(', ')}` }
      }

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (deps.options.expirationDays ?? 7))

      // Create the approval record
      const created = await deps.payload.create({
        collection: deps.options.collectionSlug ?? 'approvals',
        data: {
          targetCollection: input.collection,
          targetId: input.id,
          targetTitle,
          targetVersion,
          previewUrl,
          requestedBy: ctx.user.id,
          requestedAt: new Date().toISOString(),
          requestReason: input.requestReason,
          changesSummary: input.changesSummary,
          approverGroups: input.approverGroups,
          status: 'pending',
          expiresAt: expiresAt.toISOString(),
          notifiedApprovers: [],
          consumedTokens: [],
        },
      })

      // Fire event — C11 picks this up to send notifications
      await deps.options.inngest.send({
        name: 'approval/requested',
        data: {
          approvalId: String(created.id),
          approverIds: approvers.map((a) => a.id),
        },
      })

      // Audit
      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        actor: { type: 'user', userId: ctx.user.id, userName: ctx.user.name, apiKeyName: ctx.apiKeyName },
        action: 'approval.requested',
        mcpServer: 'approvals',
        mcpTool: 'request_approval',
        targetCollection: input.collection,
        targetId: input.id,
        targetTitle,
        prompt: input._meta?.userPrompt,
        reasoning: input._meta?.reasoning,
        changesSummary: input.changesSummary,
        approvalRequestId: String(created.id),
      })

      return {
        approvalId: String(created.id),
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        approvers: approvers.map((a) => ({ id: a.id, name: a.name ?? a.email })),
        previewUrl,
      }
    },
  }
}

function buildPreviewUrl(options: ApprovalsPluginOptions, collection: string, slug: string): string {
  const baseUrl = options.publicUrl ?? process.env.NEXT_PUBLIC_SERVER_URL ?? ''
  return `${baseUrl}/api/preview?collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`
}
```

`src/tools/respond-to-approval.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/claude-cms-core'
import type { Payload } from 'payload'
import type { ApprovalsPluginOptions } from '../options'

export function createRespondToApprovalTool(deps: {
  payload: Payload
  options: ApprovalsPluginOptions
}): McpToolDefinition {
  return {
    name: 'respond_to_approval',
    description:
      "Records an approver's decision on a pending approval. Valid decisions: approve, decline, request_changes. Approvers can also respond via email action links; this tool is for when they respond conversationally through Claude.",
    inputSchema: withMeta({
      approvalId: z.string(),
      decision: z.enum(['approve', 'decline', 'request_changes']),
      notes: z.string().optional().describe('Decision rationale, shown to the requester'),
    }),
    handler: async (input, ctx) => {
      if (!ctx.user) return { error: 'Must be authenticated to respond to approvals' }

      const approval = await deps.payload.findByID({
        collection: deps.options.collectionSlug ?? 'approvals',
        id: input.approvalId,
      })
      if (!approval) return { error: 'Approval not found' }
      if (approval.status !== 'pending') {
        return { error: `Approval is already ${approval.status}` }
      }

      // Check approver is in a valid group (simple check — real implementation
      // would call options.groupResolver to confirm membership)
      const userGroups = ctx.user.groups ?? []
      const hasAccess = (approval.approverGroups as string[]).some((g) => userGroups.includes(g))
      if (!hasAccess) {
        return { error: 'You are not in an approver group for this request' }
      }

      // Prevent self-approval
      if (String(approval.requestedBy) === ctx.user.id) {
        return { error: 'You cannot approve your own request' }
      }

      const statusMap = {
        approve: 'granted',
        decline: 'declined',
        request_changes: 'changes-requested',
      } as const

      const auditActionMap = {
        approve: 'approval.granted',
        decline: 'approval.declined',
        request_changes: 'approval.changes_requested',
      } as const

      await deps.payload.update({
        collection: deps.options.collectionSlug ?? 'approvals',
        id: input.approvalId,
        data: {
          status: statusMap[input.decision],
          decidedBy: ctx.user.id,
          decidedAt: new Date().toISOString(),
          decisionNotes: input.notes,
        },
      })

      // Fire event
      await deps.options.inngest.send({
        name: 'approval/decided',
        data: {
          approvalId: input.approvalId,
          decision: statusMap[input.decision],
        },
      })

      // Audit
      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        actor: { type: 'user', userId: ctx.user.id, userName: ctx.user.name, apiKeyName: ctx.apiKeyName },
        action: auditActionMap[input.decision],
        mcpServer: 'approvals',
        mcpTool: 'respond_to_approval',
        targetCollection: String(approval.targetCollection),
        targetId: String(approval.targetId),
        targetTitle: String(approval.targetTitle),
        approvalRequestId: input.approvalId,
        reasoning: input.notes,
      })

      return { success: true, status: statusMap[input.decision] }
    },
  }
}
```

`src/tools/get-approval-status.ts`, `src/tools/list-pending-approvals.ts`, `src/tools/list-my-requests.ts` — read-only queries that format results for conversational consumption. Follow the pattern from C5's read tools.

`src/tools/index.ts`:

```typescript
export { createRequestApprovalTool } from './request-approval'
export { createRespondToApprovalTool } from './respond-to-approval'
export { createGetApprovalStatusTool } from './get-approval-status'
export { createListPendingApprovalsTool } from './list-pending-approvals'
export { createListMyRequestsTool } from './list-my-requests'
```

### C7.7 — Build the action endpoint

`src/endpoints/action.ts`:

```typescript
import type { Endpoint } from 'payload'
import { verifyActionToken } from '../tokens'
import type { ApprovalsPluginOptions } from '../options'

export function createActionEndpoint(options: ApprovalsPluginOptions): Endpoint {
  const secret = options.tokenSecret ?? process.env.APPROVAL_TOKEN_SECRET!

  return {
    path: '/api/approvals/action',
    method: 'get',
    handler: async (req) => {
      const url = new URL(req.url ?? '')
      const token = url.searchParams.get('token')
      if (!token) {
        return htmlResponse(renderError('Missing token'), 400)
      }

      const verification = await verifyActionToken(token, secret)
      if ('error' in verification) {
        return htmlResponse(renderError(verification.error), 401)
      }

      const approval = await req.payload.findByID({
        collection: options.collectionSlug ?? 'approvals',
        id: verification.approvalId,
      })

      if (!approval) return htmlResponse(renderError('Approval not found'), 404)
      if (approval.status !== 'pending') {
        return htmlResponse(renderInfo(`This approval has already been ${approval.status}.`), 200)
      }

      // Check token not already consumed
      const consumed = (approval.consumedTokens as string[] | undefined) ?? []
      if (consumed.includes(token)) {
        return htmlResponse(renderError('This action link has already been used'), 400)
      }

      // Check expiration
      if (approval.expiresAt && new Date(approval.expiresAt as string) < new Date()) {
        return htmlResponse(renderInfo('This approval request has expired.'), 200)
      }

      // For a confirmation-required pattern: if no confirm flag, show a
      // confirmation page; if confirm=true, record the decision.
      const confirm = url.searchParams.get('confirm') === 'true'
      if (!confirm) {
        return htmlResponse(renderConfirmation(approval, verification.action, token))
      }

      // Record the decision
      const statusMap: Record<string, string> = {
        approve: 'granted',
        decline: 'declined',
        changes: 'changes-requested',
        discuss: 'pending', // discuss doesn't change status; it triggers a follow-up
      }

      const newStatus = statusMap[verification.action]
      if (verification.action !== 'discuss') {
        await req.payload.update({
          collection: options.collectionSlug ?? 'approvals',
          id: String(approval.id),
          data: {
            status: newStatus,
            decidedBy: verification.approverId,
            decidedAt: new Date().toISOString(),
            consumedTokens: [...consumed, token],
          },
        })

        await options.inngest.send({
          name: 'approval/decided',
          data: { approvalId: String(approval.id), decision: newStatus },
        })
      }

      return htmlResponse(renderSuccess(verification.action, approval))
    },
  }
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function renderConfirmation(approval: any, action: string, token: string): string {
  const actionLabel = {
    approve: 'Approve',
    decline: 'Decline',
    changes: 'Request changes',
    discuss: 'Start discussion',
  }[action] ?? action

  return htmlPage(`
    <h1>${actionLabel}: ${escape(approval.targetTitle)}</h1>
    <p><strong>Summary:</strong> ${escape(approval.changesSummary)}</p>
    <form method="GET">
      <input type="hidden" name="token" value="${escape(token)}" />
      <input type="hidden" name="confirm" value="true" />
      <button type="submit">Confirm: ${actionLabel}</button>
    </form>
  `)
}

function renderSuccess(action: string, approval: any): string {
  return htmlPage(`<h1>Done.</h1><p>Your decision has been recorded.</p>`)
}

function renderError(message: string): string {
  return htmlPage(`<h1>Error</h1><p>${escape(message)}</p>`)
}

function renderInfo(message: string): string {
  return htmlPage(`<h1>Notice</h1><p>${escape(message)}</p>`)
}

function htmlPage(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Approval</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 3rem auto; padding: 0 1rem; color: #18181B; line-height: 1.6; }
    button { background: #18181B; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.25rem; font-size: 1rem; cursor: pointer; }
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
```

The HTML is deliberately minimal and un-branded. Clients can override the endpoint path and supply their own branded action pages if they want. Core stays neutral.

### C7.8 — Build the plugin

`src/plugin.ts`:

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import { createMcpHandler, createNamedLogger } from '@forumone/claude-cms-core'
import { validateOptions, type ApprovalsPluginOptions } from './options'
import { createApprovalsCollection } from './collection'
import { createApprovalResolver } from './resolver'
import { createActionEndpoint } from './endpoints/action'
import {
  createRequestApprovalTool,
  createRespondToApprovalTool,
  createGetApprovalStatusTool,
  createListPendingApprovalsTool,
  createListMyRequestsTool,
} from './tools'

export const approvalsPlugin: CorePlugin<ApprovalsPluginOptions> = (rawOptions) => (incomingConfig) => {
  if (rawOptions.enabled === false) return incomingConfig

  const options = validateOptions(rawOptions)
  const routePrefix = options.routePrefix ?? '/api/approvals'
  const logger = createNamedLogger('approvals', options.logger)

  const collection = createApprovalsCollection({
    slug: options.collectionSlug,
    groupSlugs: options.groups.map((g) => g.slug),
  })

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), collection],
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      createActionEndpoint(options),
      {
        path: `${routePrefix}/mcp`,
        method: 'post',
        handler: async (req) => {
          const handler = (req.payload as unknown as Record<symbol, unknown>)[MCP_HANDLER_SYMBOL] as
            | ((r: Request) => Promise<Response>) | undefined
          if (!handler) {
            return new Response(JSON.stringify({ error: 'Approvals MCP not initialized' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          }
          return handler(req as unknown as Request)
        },
      },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      const registry = getPluginRegistry(payload)
      registry.requireCapability('audit-log', '@forumone/claude-cms-approvals')

      // Expose the resolver for Publishing to consume
      const resolver = createApprovalResolver({ payload, collectionSlug: options.collectionSlug })
      attachResolver(payload, resolver)

      const tools = [
        createRequestApprovalTool({ payload, options }),
        createRespondToApprovalTool({ payload, options }),
        createGetApprovalStatusTool({ payload, options }),
        createListPendingApprovalsTool({ payload, options }),
        createListMyRequestsTool({ payload, options }),
      ]

      const handler = createMcpHandler({
        payload,
        serverName: 'approvals',
        tools,
        logger: { info: logger.info, error: logger.error },
      })

      Object.defineProperty(payload as object, MCP_HANDLER_SYMBOL, {
        value: handler,
        enumerable: false,
        writable: false,
      })

      registry.register({
        id: '@forumone/claude-cms-approvals',
        version: '0.1.0',
        capabilities: ['approvals', 'approval-resolver'],
      })

      logger.info('Approvals server ready', {
        groups: options.groups.map((g) => g.slug),
        expirationDays: options.expirationDays ?? 7,
      })
    },
  }
}

const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/claude-cms/approvals-mcp-handler')
const RESOLVER_SYMBOL = Symbol.for('@forumone/claude-cms/approvals-resolver')

function attachResolver(payload: unknown, resolver: unknown) {
  Object.defineProperty(payload as object, RESOLVER_SYMBOL, {
    value: resolver,
    enumerable: false,
    writable: false,
  })
}

/**
 * Clients wire the Publishing plugin's approvalResolver to the Approvals
 * plugin's resolver by calling this after both plugins are registered.
 * Alternatively, clients pass the resolver directly; this helper is for
 * convenience.
 */
export function getApprovalResolver(payload: unknown) {
  return (payload as Record<symbol, unknown>)[RESOLVER_SYMBOL] as
    | ReturnType<typeof createApprovalResolver>
    | undefined
}
```

### C7.9 — Index, tests, README, changeset

`src/index.ts`:

```typescript
export { approvalsPlugin, getApprovalResolver } from './plugin'
export { createApprovalResolver } from './resolver'
export type { ApprovalsPluginOptions, ApproverGroup, GroupResolver } from './options'
```

Tests for: token generation + verification (including replay prevention via consumed list), collection schema, resolver, each MCP tool, action endpoint (token validation, confirmation flow, already-used, expired cases), plugin registration.

README with a note on wiring Publishing + Approvals together:

```typescript
import { approvalsPlugin, getApprovalResolver } from '@forumone/claude-cms-approvals'
import { publishingPlugin } from '@forumone/claude-cms-publishing'

// Approvals must be registered first so its resolver is available
export default buildConfig({
  plugins: [
    auditPlugin({ inngest }),
    approvalsPlugin({ groups: [...], groupResolver, inngest }),
    publishingPlugin({
      collections: [...],
      inngest,
      // Pass a function that looks up the resolver at call time
      approvalResolver: {
        getActiveApproval: async (collection, id, version) => {
          // `payload` is accessible through the tool handler context in practice;
          // in a real wiring, use a small wrapper that retrieves the resolver lazily.
          return null // placeholder
        },
      },
    }),
  ],
})
```

(Improve this wiring pattern before release — the static example above is awkward. The real implementation should make wiring feel natural.)

Changeset:

> Initial release. Conversational approval workflow with HMAC-signed action tokens, per-group approver resolution, first-decision-wins semantics, seven-day default expiration, and five MCP tools (request, respond, status, list pending, list mine). Provides an approval resolver for the Publishing Server to consume.

## Acceptance criteria

- [ ] Approvals collection with full schema
- [ ] HMAC token generation and verification (with replay prevention via consumed tokens list)
- [ ] Resolver implements ApprovalResolver from Publishing
- [ ] All five MCP tools work with audit writes
- [ ] Action endpoint validates tokens, shows confirmation, records decisions
- [ ] Plugin fails at init if audit plugin is missing or token secret is too short
- [ ] Self-approval is blocked
- [ ] Events fire for requested and decided
- [ ] Wiring documented: how Publishing consumes the resolver
- [ ] Test coverage 80%+

## Notes for Claude Code

- First-decision-wins is not a limitation, it's a deliberate Phase 1 choice. Multi-party approvals add complexity that should only be paid for when a client actually needs it. Document this in the README so users know what they're getting.
- The action endpoint's HTML is minimal on purpose. A beautifully branded confirmation page is a client concern, not a core concern. Clients can replace the endpoint with their own handler that calls into core's token verification and state update.
- The token-consumption check is what prevents replay attacks. A valid token can be used exactly once. Test this thoroughly — it's the single most important security property of the action flow.
- Resolving the approval resolver into Publishing has an awkward timing issue: Publishing runs `onInit` potentially before Approvals. The symbol-attachment pattern works if Publishing looks up the resolver at tool-call time rather than plugin-init time. Make sure the Publishing plugin's approval step retrieves the resolver lazily via the symbol rather than capturing it in a closure at init.
- The Phase 1 wiring example is clunky. A future Phase 2 enhancement should make it cleaner, possibly by publishing a `wirePlugins()` helper that handles cross-plugin wiring conventions. For now, document the pattern and move on.
- Commit after each major section: collection (C7.3), tokens (C7.4), resolver (C7.5), each tool group (C7.6), action endpoint (C7.7), plugin (C7.8).

## What's next

Phase C8 builds the Audit query server — the MCP layer over the audit log that core already records. It's the smallest of the server packages because most of the work (writing audit events) already happens in core. C8 just adds read tools.
