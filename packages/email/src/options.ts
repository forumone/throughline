import type { Inngest } from 'inngest'
import type { BaseCorePluginOptions } from '@forumone/throughline-plugin-contract'
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
  /** Inngest client used to register the three notification functions. */
  inngest: Inngest
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
  if (!options.inngest) {
    throw new Error('emailPlugin requires an Inngest client (`options.inngest`).')
  }
  const apiKey = options.apiKey ?? process.env['RESEND_API_KEY']
  if (!apiKey) {
    throw new Error('emailPlugin requires `options.apiKey` or the RESEND_API_KEY env var.')
  }
  const fromAddress = options.fromAddress ?? process.env['EMAIL_FROM_ADDRESS']
  if (!fromAddress) {
    throw new Error(
      'emailPlugin requires `options.fromAddress` or the EMAIL_FROM_ADDRESS env var.',
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
