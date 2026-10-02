import { checkEnvValue } from '@forumone/throughline-core'
import type { Inngest } from 'inngest'
import type { WorkflowFailureHandler } from '@forumone/throughline-workflows'
import type { BaseCorePluginOptions, EnvRequirement } from '@forumone/throughline-plugin-contract'
import type { EmailBrandTokens } from './tokens.js'

export type ApprovalActionKind = 'approve' | 'decline' | 'changes' | 'discuss'

export interface ResolvedRecipient {
  email: string
  name?: string
}

export interface BuildActionUrlArgs {
  approvalId: string
  action: ApprovalActionKind
  approverId: string
}

export interface EmailPluginOptions extends BaseCorePluginOptions {
  /**
   * Inngest client used to register the three notification functions. Omit it
   * on a site that runs jobs on Payload Jobs: pass `emailJobs(options)` to its
   * jobs adapter instead.
   */
  inngest?: Inngest
  /**
   * Called once when a notification run has exhausted its retries. Default:
   * `createTerminalFailureHandler({ payload })` from the workflows package,
   * which records a `job-failures` row (with `jobFailuresPlugin`), logs, and
   * reports. These three ran with none, so a failed approval email was silent.
   */
  onTerminalFailure?: WorkflowFailureHandler
  /** Resend API key. Falls back to `process.env.RESEND_API_KEY`. */
  apiKey?: string
  /** From address (e.g. `notifications@example.com`). Falls back to `EMAIL_FROM_ADDRESS`. */
  fromAddress?: string
  /**
   * From display name. Falls back to `EMAIL_FROM_NAME` then `tokens.brandName`.
   * Centralizing on `brandName` is intentional — keep "this came from <site>"
   * consistent across header, From, and footer.
   */
  fromName?: string
  /** Reply-to. Falls back to `EMAIL_REPLY_TO`. */
  replyTo?: string
  /**
   * Brand-token overrides. Anything omitted falls back to the neutral defaults
   * (black on white, system sans, "Your Site"). Pass an empty object to keep
   * defaults entirely.
   */
  tokens?: Partial<EmailBrandTokens>
  /** Approvals collection slug. Default: 'approvals'. */
  approvalsCollectionSlug?: string
  /**
   * Resolves an approver's email + display name from a user ID. The plugin
   * stays decoupled from Payload's user model — different deployments may
   * have users in different collections with different field names.
   */
  resolveApprover: (userId: string) => Promise<ResolvedRecipient | null>
  /** Resolves a requester's email + display name from a user ID. */
  resolveRequester: (userId: string) => Promise<ResolvedRecipient | null>
  /**
   * Builds the URL for an approval action button (Approve, Request changes,
   * Discuss, Decline). Default implementation lands in a follow-up; clients
   * normally pass their own builder that wraps approvals' HMAC-signed token.
   */
  buildActionUrl: (args: BuildActionUrlArgs) => Promise<string>
  /**
   * Builds a deployment-relative preview URL for the given target document.
   * Default implementation builds `${NEXT_PUBLIC_SERVER_URL}/preview?...` if
   * the env var is set; clients with bespoke previews override.
   */
  buildPreviewUrl?: (args: {
    targetCollection: string
    targetId: string
    approvalId: string
  }) => Promise<string>
}

export const DEFAULT_APPROVALS_COLLECTION_SLUG = 'approvals'

const API_KEY_ENV = {
  name: 'RESEND_API_KEY',
  why: 'Sends approval and form notification email through Resend; emailPlugin will not start without it.',
} as const satisfies EnvRequirement

const FROM_ADDRESS_ENV = {
  name: 'EMAIL_FROM_ADDRESS',
  why: 'The From address on every email. It must be a verified sender on your Resend domain.',
} as const satisfies EnvRequirement

/**
 * What `emailPlugin` reads from the environment when the matching option is
 * omitted, and refuses to start without. Hand it to `assertEnvironment` from
 * `@forumone/throughline-core` so a site reports it with everything else.
 *
 * Leave it out if you pass `apiKey` and `fromAddress` yourself. The optional
 * `EMAIL_FROM_NAME` and `EMAIL_REPLY_TO` are not requirements.
 */
export const emailEnv: readonly EnvRequirement[] = [API_KEY_ENV, FROM_ADDRESS_ENV]

export interface ResolvedEmailEnv {
  apiKey: string
  fromAddress: string
  fromName: string
  replyTo?: string
}

/**
 * Validates options at plugin init. Resolves the Resend secrets via env
 * fallback so missing configuration surfaces immediately rather than on the
 * first Inngest invocation.
 */
export function validateOptions(options: EmailPluginOptions): {
  options: EmailPluginOptions
  env: ResolvedEmailEnv
  brandName: string
} {
  // The backstop for a site that does not call `assertEnvironment`, driven by
  // the same declarations it would have passed.
  const apiKey = options.apiKey ?? process.env[API_KEY_ENV.name]
  if (apiKey === undefined || checkEnvValue(API_KEY_ENV, apiKey)) {
    throw new Error(`emailPlugin requires \`options.apiKey\` or the ${API_KEY_ENV.name} env var.`)
  }
  const fromAddress = options.fromAddress ?? process.env[FROM_ADDRESS_ENV.name]
  if (fromAddress === undefined || checkEnvValue(FROM_ADDRESS_ENV, fromAddress)) {
    throw new Error(
      `emailPlugin requires \`options.fromAddress\` or the ${FROM_ADDRESS_ENV.name} env var.`,
    )
  }
  if (typeof options.resolveApprover !== 'function' || typeof options.resolveRequester !== 'function') {
    throw new Error(
      'emailPlugin requires `options.resolveApprover` and `options.resolveRequester` so the plugin can map user IDs to email addresses without coupling to a specific user-model schema.',
    )
  }
  if (typeof options.buildActionUrl !== 'function') {
    throw new Error(
      'emailPlugin requires `options.buildActionUrl` so approval action buttons resolve to deployment-specific HMAC-signed URLs.',
    )
  }

  const brandName =
    options.fromName ??
    process.env['EMAIL_FROM_NAME'] ??
    options.tokens?.brandName ??
    'Your Site'

  const env: ResolvedEmailEnv = {
    apiKey,
    fromAddress,
    fromName: brandName,
  }
  const replyTo = options.replyTo ?? process.env['EMAIL_REPLY_TO']
  if (replyTo) env.replyTo = replyTo

  return { options, env, brandName }
}
