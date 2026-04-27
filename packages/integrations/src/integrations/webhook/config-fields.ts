import type { Field } from 'payload'

/**
 * The event names the webhook integration can subscribe to. Kept in sync
 * with the core `FrameworkEvents` taxonomy plus the approval/decided event
 * augmented by the approvals package.
 */
export const WEBHOOK_EVENT_OPTIONS = [
  { label: 'Page published', value: 'content/page.published' },
  { label: 'Page unpublished', value: 'content/page.unpublished' },
  { label: 'Page rolled back', value: 'content/page.rolled_back' },
  { label: 'Form submission received', value: 'form/submission.received' },
  { label: 'Approval decided', value: 'approval/decided' },
] as const

export const WEBHOOK_DEFAULT_TIMEOUT_SECONDS = 10
export const MIN_SIGNING_SECRET_LENGTH = 32

export const configFields: Field[] = [
  {
    name: 'targetUrl',
    type: 'text',
    required: true,
    admin: { description: 'HTTPS URL the integration POSTs events to.' },
  },
  {
    name: 'signingSecret',
    type: 'text',
    required: true,
    admin: {
      description:
        `Shared secret used to compute HMAC-SHA256 signatures (>=${MIN_SIGNING_SECRET_LENGTH} chars). The receiver verifies the x-throughline-signature header to confirm the request originated from this site.`,
    },
  },
  {
    name: 'eventFilter',
    type: 'select',
    hasMany: true,
    options: WEBHOOK_EVENT_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    admin: {
      description: 'Only deliver these event types. Leave empty to deliver every subscribed event.',
    },
  },
  {
    name: 'includeFullPayload',
    type: 'checkbox',
    defaultValue: false,
    admin: {
      description:
        'If true, send the entire event data block. If false, send only IDs and slugs to keep payloads small.',
    },
  },
  {
    name: 'timeoutSeconds',
    type: 'number',
    defaultValue: WEBHOOK_DEFAULT_TIMEOUT_SECONDS,
    admin: { description: `Per-request timeout in seconds. Default ${WEBHOOK_DEFAULT_TIMEOUT_SECONDS}.` },
  },
]

export interface WebhookConfig {
  targetUrl: string
  signingSecret: string
  eventFilter?: string[]
  includeFullPayload?: boolean
  timeoutSeconds?: number
}
