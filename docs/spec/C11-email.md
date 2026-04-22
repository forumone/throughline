# Phase C11 — Email Package

## Goal

Build `@forumone/claude-cms-email` — the Resend wrapper, React Email base layout with themeable brand tokens, transactional email templates (approval request, decision, expired), and Inngest functions that subscribe to the notification events fired by C10's audit echo. Ships with neutral defaults so clients get working email immediately; brand customization happens through a token object passed at configuration time.

## Prerequisites

- C4 complete; Inngest client and event taxonomy
- C7 complete; Approvals Server fires events the audit echo picks up
- C10 complete; `createAuditEventEchoFunction` fires the notification events this package subscribes to

## Context

Email is where the approval workflow becomes visible. A marketer requests approval via Claude; moments later, approvers receive a well-designed email with a one-sentence summary, a preview link, and three clear actions. No CMS admin required — they decide from their inbox.

Three design decisions shape this package:

**Brand tokens as input, never hardcoded.** Email templates accept a token object for colors, typography, and brand name. Core ships neutral defaults (black on white, Inter, "Your Site"). Clients pass their own tokens at configuration time. Forum One's purple and black land via their brand package, not in core.

**React Email for templating.** The component model lets us share styling patterns across templates without fighting cross-client CSS compatibility on our own. React Email handles the Outlook-vs-Gmail quagmire.

**Plain HTML, not frameworks.** The action endpoint in C7 returns minimal HTML, not a React SSR page. Emails are the same — rendered to HTML strings at send time, not served dynamically. Static rendering, static testing.

One more principle: **fallback to plaintext.** Every email renders to both HTML and plaintext. Plaintext is for accessibility (screen readers), deliverability (spam filter scores), and for email clients that refuse HTML. It's not optional.

## Tasks

### C11.1 — Scaffold the package

```
packages/email/
├── src/
│   ├── plugin.ts
│   ├── options.ts
│   ├── client.ts
│   ├── tokens.ts
│   ├── templates/
│   │   ├── _layout.tsx
│   │   ├── ApprovalRequest.tsx
│   │   ├── ApprovalDecision.tsx
│   │   ├── ApprovalExpired.tsx
│   │   └── index.ts
│   ├── functions/
│   │   ├── notify-approval-request.ts
│   │   ├── notify-approval-decision.ts
│   │   ├── notify-approval-expired.ts
│   │   └── index.ts
│   └── index.ts
├── scripts/
│   └── preview.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-email",
  "version": "0.1.0",
  "description": "Transactional email system with themeable templates for the Claude-First CMS framework.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./templates": { "types": "./dist/templates/index.d.ts", "default": "./dist/templates/index.js" }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "email:preview": "email dev --dir src/templates"
  },
  "peerDependencies": {
    "inngest": "^3.0.0",
    "payload": "^3.0.0",
    "react": "^18.0.0 || ^19.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-core": "workspace:*",
    "@forumone/claude-cms-plugin-contract": "workspace:*",
    "@react-email/components": "^0.0.25",
    "@react-email/render": "^1.0.0",
    "resend": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "@types/react": "^19.0.0",
    "inngest": "^3.0.0",
    "payload": "^3.0.0",
    "react": "^19.0.0",
    "react-email": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### C11.2 — Define tokens and options

`src/tokens.ts`:

```typescript
export interface EmailBrandTokens {
  /** Primary brand color (buttons, links). */
  brandPrimary: string
  /** Hover state for primary brand color. */
  brandPrimaryHover: string
  /** Accent color for secondary elements. */
  brandAccent?: string
  /** Main body text color. */
  textPrimary: string
  /** Secondary text (muted). */
  textSecondary: string
  /** Page background. */
  bgPrimary: string
  /** Alternate background for subdued sections. */
  bgSecondary: string
  /** Border color. */
  border: string
  /** Font family stack. */
  fontFamilySans: string
  /** The display name of the deployment (shown in headers and as sender name). */
  brandName: string
  /** Optional logo URL shown in the email header. */
  logoUrl?: string
}

export const defaultTokens: EmailBrandTokens = {
  brandPrimary: '#2563EB',
  brandPrimaryHover: '#1D4ED8',
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#FAFAFA',
  border: '#E4E4E7',
  fontFamilySans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  brandName: 'Your Site',
}
```

`src/options.ts`:

```typescript
import type { BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import type { Inngest } from 'inngest'
import type { EmailBrandTokens } from './tokens'

export interface EmailPluginOptions extends BaseCorePluginOptions {
  inngest: Inngest
  /** Resend API key. Defaults to RESEND_API_KEY env var. */
  apiKey?: string
  /** From address. Defaults to EMAIL_FROM_ADDRESS env var. */
  fromAddress?: string
  /** From name. Defaults to EMAIL_FROM_NAME env var, then tokens.brandName. */
  fromName?: string
  /** Reply-to address. Defaults to EMAIL_REPLY_TO env var. */
  replyTo?: string
  /** Brand tokens for template theming. Uses neutral defaults if not provided. */
  tokens?: Partial<EmailBrandTokens>
  /** The approvals collection slug. Default: 'approvals'. */
  approvalsCollectionSlug?: string
  /** A function that resolves an approver's email and name from their user ID. */
  resolveApprover?: (userId: string) => Promise<{ email: string; name?: string } | null>
  /** A function that resolves a requester's email and name from their user ID. */
  resolveRequester?: (userId: string) => Promise<{ email: string; name?: string } | null>
  /**
   * A function that generates action URLs from an approval record and approver.
   * Defaults to building URLs against process.env.NEXT_PUBLIC_SERVER_URL using
   * HMAC tokens compatible with the approvals plugin's action endpoint.
   */
  buildActionUrl?: (args: {
    approvalId: string
    action: 'approve' | 'decline' | 'changes' | 'discuss'
    approverId: string
  }) => Promise<string>
}

export function validateOptions(options: EmailPluginOptions): EmailPluginOptions {
  if (!options.inngest) {
    throw new Error('emailPlugin requires an Inngest client')
  }
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('emailPlugin requires apiKey in options or RESEND_API_KEY env var')
  }
  const fromAddress = options.fromAddress ?? process.env.EMAIL_FROM_ADDRESS
  if (!fromAddress) {
    throw new Error('emailPlugin requires fromAddress in options or EMAIL_FROM_ADDRESS env var')
  }
  if (!options.resolveApprover || !options.resolveRequester) {
    throw new Error(
      'emailPlugin requires resolveApprover and resolveRequester functions. These map user IDs to email addresses.',
    )
  }
  return options
}
```

### C11.3 — Build the Resend client wrapper

`src/client.ts`:

```typescript
import { Resend } from 'resend'
import { render } from '@react-email/render'
import type { ReactElement } from 'react'

export interface EmailClient {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  template: ReactElement
  tags?: Array<{ name: string; value: string }>
  replyTo?: string
}

export interface SendEmailResult {
  id: string
  deliveredAt: string
}

export interface EmailClientOptions {
  apiKey: string
  fromAddress: string
  fromName: string
  defaultReplyTo?: string
}

export function createEmailClient(options: EmailClientOptions): EmailClient {
  const resend = new Resend(options.apiKey)
  const from = `${options.fromName} <${options.fromAddress}>`

  return {
    async send(params) {
      const html = await render(params.template)
      const text = await render(params.template, { plainText: true })

      const result = await resend.emails.send({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html,
        text,
        tags: params.tags,
        replyTo: params.replyTo ?? options.defaultReplyTo,
      })

      if (result.error) {
        throw new Error(`Email send failed: ${result.error.message}`)
      }

      return {
        id: result.data?.id ?? 'unknown',
        deliveredAt: new Date().toISOString(),
      }
    },
  }
}
```

### C11.4 — Build the email layout

`src/templates/_layout.tsx`:

```tsx
import { Body, Container, Head, Html, Preview, Section, Text, Hr } from '@react-email/components'
import type { ReactNode } from 'react'
import type { EmailBrandTokens } from '../tokens'

export interface LayoutProps {
  preview: string
  tokens: EmailBrandTokens
  children: ReactNode
}

export function EmailLayout({ preview, tokens, children }: LayoutProps) {
  const bodyStyle = {
    backgroundColor: '#F5F5F5',
    fontFamily: tokens.fontFamilySans,
    margin: 0,
    padding: '24px 0',
  }

  const containerStyle = {
    backgroundColor: tokens.bgPrimary,
    maxWidth: 600,
    margin: '0 auto',
    padding: 32,
    borderRadius: 8,
  }

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={{ color: tokens.textPrimary, fontWeight: 700, fontSize: 18, margin: 0 }}>
              {tokens.brandName}
            </Text>
          </Section>
          <Hr style={{ borderColor: tokens.border, margin: '24px 0' }} />
          {children}
          <Hr style={{ borderColor: tokens.border, margin: '32px 0 16px' }} />
          <Text style={{ color: tokens.textSecondary, fontSize: 12, margin: 0 }}>
            This message is from your {tokens.brandName} content system. If you did not expect this, contact your system administrator.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
```

### C11.5 — Build the approval request template

`src/templates/ApprovalRequest.tsx`:

```tsx
import { Section, Text, Button, Heading, Link } from '@react-email/components'
import { EmailLayout } from './_layout'
import type { EmailBrandTokens } from '../tokens'

export interface ApprovalRequestEmailProps {
  approverName: string
  requesterName: string
  targetTitle: string
  targetKind: string // "page" | "post" | etc.
  changesSummary: string
  requestReason?: string
  previewUrl: string
  approveUrl: string
  changesUrl: string
  discussUrl: string
  expiresAt: string
  tokens: EmailBrandTokens
}

export function ApprovalRequestEmail(props: ApprovalRequestEmailProps) {
  const { tokens } = props

  const boxStyle = {
    backgroundColor: tokens.bgSecondary,
    padding: 16,
    borderRadius: 6,
    marginTop: 16,
  }

  const labelStyle = {
    color: tokens.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    margin: 0,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }

  const primaryButtonStyle = {
    backgroundColor: tokens.textPrimary,
    color: '#FFFFFF',
    padding: '12px 20px',
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-block',
  }

  const approveButtonStyle = {
    backgroundColor: tokens.brandPrimary,
    color: '#FFFFFF',
    padding: '10px 16px',
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    display: 'inline-block',
  }

  const outlineButtonStyle = {
    backgroundColor: tokens.bgPrimary,
    color: tokens.textPrimary,
    padding: '10px 16px',
    border: `1px solid ${tokens.border}`,
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    display: 'inline-block',
  }

  return (
    <EmailLayout preview={`Approval needed: ${props.targetTitle}`} tokens={tokens}>
      <Heading style={{ color: tokens.textPrimary, fontSize: 22, margin: 0 }}>
        Approval needed
      </Heading>

      <Text style={{ color: tokens.textPrimary, fontSize: 16, marginTop: 8 }}>
        Hi {props.approverName},
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 16 }}>
        {props.requesterName} is requesting approval to publish the {props.targetKind} <strong>{props.targetTitle}</strong>.
      </Text>

      <Section style={boxStyle}>
        <Text style={labelStyle}>What changed</Text>
        <Text style={{ color: tokens.textPrimary, fontSize: 14, margin: '8px 0 0' }}>
          {props.changesSummary}
        </Text>
      </Section>

      {props.requestReason && (
        <Section style={{ marginTop: 16 }}>
          <Text style={labelStyle}>Why</Text>
          <Text style={{ color: tokens.textPrimary, fontSize: 14, margin: '8px 0 0' }}>
            {props.requestReason}
          </Text>
        </Section>
      )}

      <Section style={{ marginTop: 24 }}>
        <Button href={props.previewUrl} style={primaryButtonStyle}>
          Preview the changes
        </Button>
      </Section>

      <Section style={{ marginTop: 32 }}>
        <Text style={{ color: tokens.textPrimary, fontSize: 14, fontWeight: 600 }}>
          Your decision:
        </Text>
        <table style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: 8 }}>
                <Button href={props.approveUrl} style={approveButtonStyle}>
                  Approve
                </Button>
              </td>
              <td style={{ paddingRight: 8 }}>
                <Button href={props.changesUrl} style={outlineButtonStyle}>
                  Request changes
                </Button>
              </td>
              <td>
                <Link href={props.discussUrl} style={{ color: tokens.brandPrimary, fontSize: 14, textDecoration: 'underline' }}>
                  Discuss
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 24 }}>
        This request expires {props.expiresAt}.
      </Text>
    </EmailLayout>
  )
}
```

### C11.6 — Build the decision and expired templates

`src/templates/ApprovalDecision.tsx` — similar structure, three variants (granted, declined, changes-requested):

```tsx
import { Section, Text, Button, Heading } from '@react-email/components'
import { EmailLayout } from './_layout'
import type { EmailBrandTokens } from '../tokens'

export interface ApprovalDecisionEmailProps {
  requesterName: string
  decidedBy: string
  targetTitle: string
  decision: 'granted' | 'declined' | 'changes-requested'
  decisionNotes?: string
  previewUrl: string
  tokens: EmailBrandTokens
}

export function ApprovalDecisionEmail(props: ApprovalDecisionEmailProps) {
  const { tokens, decision } = props

  const headlineByDecision: Record<typeof decision, string> = {
    granted: 'Approved',
    declined: 'Not approved',
    'changes-requested': 'Changes requested',
  }

  const colorByDecision: Record<typeof decision, string> = {
    granted: '#16A34A',
    declined: '#DC2626',
    'changes-requested': '#CA8A04',
  }

  const nextStepByDecision: Record<typeof decision, string> = {
    granted: `You can publish ${props.targetTitle} when you're ready. Ask Claude to publish it.`,
    declined: `${props.targetTitle} was not approved. Read the decision notes below and discuss with ${props.decidedBy} if needed.`,
    'changes-requested': `${props.decidedBy} requested changes to ${props.targetTitle}. Edit as requested and ask Claude to request approval again.`,
  }

  return (
    <EmailLayout
      preview={`${headlineByDecision[decision]}: ${props.targetTitle}`}
      tokens={tokens}
    >
      <Heading style={{ color: colorByDecision[decision], fontSize: 22, margin: 0 }}>
        {headlineByDecision[decision]}: {props.targetTitle}
      </Heading>

      <Text style={{ color: tokens.textPrimary, fontSize: 16, marginTop: 16 }}>
        Hi {props.requesterName},
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 16 }}>
        {props.decidedBy} reviewed your approval request.
      </Text>

      {props.decisionNotes && (
        <Section style={{
          backgroundColor: tokens.bgSecondary,
          padding: 16,
          borderRadius: 6,
          marginTop: 16,
        }}>
          <Text style={{ color: tokens.textSecondary, fontSize: 12, fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>
            Notes from {props.decidedBy}
          </Text>
          <Text style={{ color: tokens.textPrimary, fontSize: 14, margin: '8px 0 0' }}>
            {props.decisionNotes}
          </Text>
        </Section>
      )}

      <Text style={{ color: tokens.textPrimary, fontSize: 14, marginTop: 24 }}>
        <strong>Next step:</strong> {nextStepByDecision[decision]}
      </Text>

      {decision !== 'declined' && (
        <Section style={{ marginTop: 16 }}>
          <Button
            href={props.previewUrl}
            style={{
              backgroundColor: tokens.textPrimary,
              color: '#FFFFFF',
              padding: '12px 20px',
              borderRadius: 4,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
              display: 'inline-block',
            }}
          >
            Preview {props.targetTitle}
          </Button>
        </Section>
      )}
    </EmailLayout>
  )
}
```

`src/templates/ApprovalExpired.tsx` — simple, factual:

```tsx
import { Section, Text, Heading } from '@react-email/components'
import { EmailLayout } from './_layout'
import type { EmailBrandTokens } from '../tokens'

export interface ApprovalExpiredEmailProps {
  requesterName: string
  targetTitle: string
  requestedAt: string
  tokens: EmailBrandTokens
}

export function ApprovalExpiredEmail(props: ApprovalExpiredEmailProps) {
  const { tokens } = props

  return (
    <EmailLayout preview={`Approval expired: ${props.targetTitle}`} tokens={tokens}>
      <Heading style={{ color: tokens.textPrimary, fontSize: 22, margin: 0 }}>
        Approval expired
      </Heading>

      <Text style={{ color: tokens.textPrimary, fontSize: 16, marginTop: 16 }}>
        Hi {props.requesterName},
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 16 }}>
        The approval request you made for <strong>{props.targetTitle}</strong> on {props.requestedAt} has expired without a decision.
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 14, marginTop: 16 }}>
        If you still want to publish this, ask Claude to request approval again.
      </Text>
    </EmailLayout>
  )
}
```

`src/templates/index.ts`:

```typescript
export { EmailLayout } from './_layout'
export { ApprovalRequestEmail } from './ApprovalRequest'
export { ApprovalDecisionEmail } from './ApprovalDecision'
export { ApprovalExpiredEmail } from './ApprovalExpired'
export type { ApprovalRequestEmailProps } from './ApprovalRequest'
export type { ApprovalDecisionEmailProps } from './ApprovalDecision'
export type { ApprovalExpiredEmailProps } from './ApprovalExpired'
```

### C11.7 — Build the Inngest notification functions

`src/functions/notify-approval-request.ts`:

```tsx
import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient } from '../client'
import type { EmailBrandTokens } from '../tokens'
import { ApprovalRequestEmail } from '../templates'
import type { EmailPluginOptions } from '../options'

export interface NotifyApprovalRequestDeps {
  inngest: Inngest
  payload: Payload
  client: EmailClient
  tokens: EmailBrandTokens
  options: EmailPluginOptions
}

export function createNotifyApprovalRequestFunction(deps: NotifyApprovalRequestDeps): InngestFunction {
  return deps.inngest.createFunction(
    { id: 'notify-approval-request', retries: 3 },
    { event: 'notification/send-approval-request' },
    async ({ event, step, logger }) => {
      const { approvalId } = event.data as { approvalId: string }

      const approval = await step.run('load-approval', async () => {
        return deps.payload.findByID({
          collection: deps.options.approvalsCollectionSlug ?? 'approvals',
          id: approvalId,
          depth: 1,
        })
      })

      const approverIds = await step.run('resolve-approver-ids', async () => {
        // In a full implementation, look up users from approver groups using
        // the group resolver. For this phase, assume notifiedApprovers was populated
        // when the request was created, or resolve from groups at send time.
        // Simplest: the event data includes approverIds; or we look them up here.
        return (event.data as { approverIds?: string[] }).approverIds ?? []
      })

      const requester = await step.run('load-requester', async () => {
        const userId = String((approval.requestedBy as { id?: string })?.id ?? approval.requestedBy)
        return deps.options.resolveRequester!(userId)
      })

      for (const approverId of approverIds) {
        await step.run(`send-to-${approverId}`, async () => {
          const approver = await deps.options.resolveApprover!(approverId)
          if (!approver) {
            logger.warn(`No email for approver ${approverId}`)
            return
          }

          const approveUrl = await deps.options.buildActionUrl!({ approvalId, action: 'approve', approverId })
          const changesUrl = await deps.options.buildActionUrl!({ approvalId, action: 'changes', approverId })
          const discussUrl = await deps.options.buildActionUrl!({ approvalId, action: 'discuss', approverId })

          await deps.client.send({
            to: approver.email,
            subject: `Approval needed: ${approval.targetTitle}`,
            template: ApprovalRequestEmail({
              approverName: approver.name ?? approver.email,
              requesterName: requester?.name ?? requester?.email ?? 'A colleague',
              targetTitle: String(approval.targetTitle),
              targetKind: String(approval.targetCollection) === 'posts' ? 'post' : 'page',
              changesSummary: String(approval.changesSummary),
              requestReason: approval.requestReason ? String(approval.requestReason) : undefined,
              previewUrl: String(approval.previewUrl),
              approveUrl,
              changesUrl,
              discussUrl,
              expiresAt: formatDate(String(approval.expiresAt)),
              tokens: deps.tokens,
            }),
            tags: [
              { name: 'type', value: 'approval-request' },
              { name: 'approval-id', value: approvalId },
            ],
          })
        })

        await step.run(`mark-notified-${approverId}`, async () => {
          const current = (approval.notifiedApprovers as Array<{ id: string; at: string; channel: string }> | undefined) ?? []
          await deps.payload.update({
            collection: deps.options.approvalsCollectionSlug ?? 'approvals',
            id: approvalId,
            data: {
              notifiedApprovers: [
                ...current,
                { id: approverId, at: new Date().toISOString(), channel: 'email' },
              ],
            },
          })
        })
      }
    },
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
```

`src/functions/notify-approval-decision.ts` and `src/functions/notify-approval-expired.ts` follow the same pattern.

`src/functions/index.ts`:

```typescript
export { createNotifyApprovalRequestFunction } from './notify-approval-request'
export { createNotifyApprovalDecisionFunction } from './notify-approval-decision'
export { createNotifyApprovalExpiredFunction } from './notify-approval-expired'
```

### C11.8 — Build the plugin

`src/plugin.ts`:

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import { createNamedLogger } from '@forumone/claude-cms-core'
import { validateOptions, type EmailPluginOptions } from './options'
import { createEmailClient } from './client'
import { defaultTokens, type EmailBrandTokens } from './tokens'
import {
  createNotifyApprovalRequestFunction,
  createNotifyApprovalDecisionFunction,
  createNotifyApprovalExpiredFunction,
} from './functions'

export const emailPlugin: CorePlugin<EmailPluginOptions> = (rawOptions) => (incomingConfig) => {
  if (rawOptions.enabled === false) return incomingConfig

  const options = validateOptions(rawOptions)
  const logger = createNamedLogger('email', options.logger)

  const tokens: EmailBrandTokens = {
    ...defaultTokens,
    ...(options.tokens ?? {}),
  }

  return {
    ...incomingConfig,
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      const registry = getPluginRegistry(payload)

      const client = createEmailClient({
        apiKey: options.apiKey ?? process.env.RESEND_API_KEY!,
        fromAddress: options.fromAddress ?? process.env.EMAIL_FROM_ADDRESS!,
        fromName: options.fromName ?? process.env.EMAIL_FROM_NAME ?? tokens.brandName,
        defaultReplyTo: options.replyTo ?? process.env.EMAIL_REPLY_TO,
      })

      // Expose the client and notification functions via symbols so the
      // client app's Inngest endpoint can register the functions.
      Object.defineProperty(payload as object, EMAIL_CLIENT_SYMBOL, {
        value: client,
        enumerable: false,
        writable: false,
      })

      const deps = { inngest: options.inngest, payload, client, tokens, options }
      const notificationFunctions = [
        createNotifyApprovalRequestFunction(deps),
        createNotifyApprovalDecisionFunction(deps),
        createNotifyApprovalExpiredFunction(deps),
      ]

      Object.defineProperty(payload as object, EMAIL_FUNCTIONS_SYMBOL, {
        value: notificationFunctions,
        enumerable: false,
        writable: false,
      })

      registry.register({
        id: '@forumone/claude-cms-email',
        version: '0.1.0',
        capabilities: ['email', 'notification-transport'],
      })

      logger.info('Email system ready', {
        brandName: tokens.brandName,
        from: options.fromAddress ?? process.env.EMAIL_FROM_ADDRESS,
      })
    },
  }
}

const EMAIL_CLIENT_SYMBOL = Symbol.for('@forumone/claude-cms/email-client')
const EMAIL_FUNCTIONS_SYMBOL = Symbol.for('@forumone/claude-cms/email-functions')

export function getEmailClient(payload: unknown): import('./client').EmailClient | undefined {
  return (payload as Record<symbol, unknown>)[EMAIL_CLIENT_SYMBOL] as import('./client').EmailClient | undefined
}

export function getEmailFunctions(payload: unknown): import('inngest').InngestFunction[] {
  return ((payload as Record<symbol, unknown>)[EMAIL_FUNCTIONS_SYMBOL] as import('inngest').InngestFunction[]) ?? []
}
```

### C11.9 — Build the preview script

`scripts/preview.ts` — runs React Email's dev server so developers can see templates as they work:

```typescript
// This is just a convenience; the actual preview uses the react-email CLI.
// Run: pnpm email:preview
```

The `email:preview` script in `package.json` (`email dev --dir src/templates`) handles this. No implementation needed in scripts.

### C11.10 — Index, tests, README, changeset

`src/index.ts`:

```typescript
export { emailPlugin, getEmailClient, getEmailFunctions } from './plugin'
export { createEmailClient } from './client'
export { defaultTokens } from './tokens'
export type { EmailPluginOptions } from './options'
export type { EmailBrandTokens } from './tokens'
export type { EmailClient, SendEmailParams, SendEmailResult } from './client'
```

Tests for: client wrapper (mocking Resend), each template rendering (snapshot tests), notification functions (mocking email client), token merging.

README with a note on wiring:

```markdown
The Inngest notification functions are registered via `getEmailFunctions(payload)` and included in your client app's Inngest endpoint:

```typescript
import { getEmailFunctions } from '@forumone/claude-cms-email'

const emailFunctions = getEmailFunctions(payload)

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...coreWorkflowFunctions, ...emailFunctions],
})
```
```

Changeset:

> Initial release. Resend integration with React Email templates for approval workflow notifications. Themeable via brand token object. Ships approval request, decision, and expiration templates with plaintext fallbacks.

## Acceptance criteria

- [ ] Email client wraps Resend with automatic HTML + plaintext rendering
- [ ] All three templates render correctly with default tokens
- [ ] Custom tokens (colors, brand name, font family) override defaults
- [ ] Notification functions subscribe to the three notification events
- [ ] Each function handles delivery failures with retry (Inngest-native)
- [ ] Each recipient delivery is its own Inngest step (independently retryable)
- [ ] Plugin accepts resolveApprover/resolveRequester functions; fails at init if not provided
- [ ] Action URL building is pluggable (default uses HMAC tokens)
- [ ] `pnpm email:preview` runs React Email's dev server
- [ ] Test coverage 80%+

## Notes for Claude Code

- React Email's cross-client CSS compatibility is genuinely hard. Stick to the React Email components (`<Button>`, `<Section>`, `<Text>`) rather than raw divs and CSS. The components are designed for Outlook-vs-Gmail-vs-Apple-Mail robustness.
- Test templates in Outlook specifically. Gmail and Apple Mail are forgiving; Outlook is not. Use React Email's preview against real clients — the `email:preview` script helps.
- Hardcoded default tokens in the token module mean "neutral defaults that look fine with no branding." Not Forum One colors; not anyone's colors. Clients provide their brand tokens via the plugin options.
- The brand name appears in three places: the layout header, the from name, and the footer. Using one token for all three keeps things consistent. Document this.
- Per-recipient delivery as its own `step.run` is the critical retry design. If one approver's email bounces, it retries without re-sending to the others. Don't batch recipients into a single step.
- The `resolveApprover` and `resolveRequester` options are how the plugin stays decoupled from Payload's user model. Different clients may have users in a custom collection with different field names; the resolvers abstract this.
- Plain text rendering is built into React Email (`render(element, { plainText: true })`). It works surprisingly well and is worth the zero extra work.
- Commit after each template (C11.5, C11.6) and each notification function (C11.7).

## What's next

Phase C12 builds the Forms package — Payload Form Builder wrapper with policy layer, destination allowlist, spam protection, and submission fan-out. It's the last core server-side package and pulls together everything before it: collections, validation, Inngest events, email confirmations, integrations.
