import type { Inngest } from 'inngest'
import type { BaseCorePluginOptions } from '@forumone/throughline-plugin-contract'

export interface ApproverGroup {
  /** Group slug, referenced by the policy.approverGroups field on requests. */
  slug: string
  /** Human-readable group name shown in admin UI. */
  name: string
  /** Optional description shown in admin. */
  description?: string
}

export interface ResolvedApprover {
  id: string
  email: string
  name?: string
}

export interface GroupResolver {
  /**
   * Given a list of group slugs, returns the users in those groups. Used
   * when an approval is requested to materialize the actual approver list
   * and again if the action endpoint needs to confirm a token-bearing user
   * belongs to one of the request's groups.
   */
  resolveUsers: (groupSlugs: string[]) => Promise<ResolvedApprover[]>
}

export interface ApprovalsPluginOptions extends BaseCorePluginOptions {
  /** Approver groups available in this deployment. */
  groups: ApproverGroup[]
  /** Resolver mapping group slugs to users. Required. */
  groupResolver: GroupResolver
  /** Inngest client for firing approval/* events. Required. */
  inngest: Inngest
  /** HMAC signing secret for action tokens. Falls back to APPROVAL_TOKEN_SECRET env var. */
  tokenSecret?: string
  /** Days before a pending approval expires. Default: 7. */
  expirationDays?: number
  /** Override the approvals collection slug. Default: 'approvals'. */
  collectionSlug?: string
  /** Override the users collection slug used for approver/requester relationships. Default: 'users'. */
  usersSlug?: string
  /** Public base URL used to build inline action links. Defaults to NEXT_PUBLIC_SERVER_URL. */
  publicUrl?: string
}

const MIN_TOKEN_SECRET_LENGTH = 32

/**
 * Validates options at load time and resolves the token secret. Throws with
 * a targeted error on each obvious misconfiguration.
 */
export function validateOptions(
  options: ApprovalsPluginOptions,
): ApprovalsPluginOptions & { tokenSecret: string } {
  if (!options.groups || options.groups.length === 0) {
    throw new Error('approvalsPlugin requires at least one group in options.groups')
  }
  if (!options.groupResolver) {
    throw new Error('approvalsPlugin requires a groupResolver in options')
  }
  if (!options.inngest) {
    throw new Error('approvalsPlugin requires an Inngest client in options.inngest')
  }
  const secret = options.tokenSecret ?? process.env['APPROVAL_TOKEN_SECRET']
  if (!secret || secret.length < MIN_TOKEN_SECRET_LENGTH) {
    throw new Error(
      `approvalsPlugin requires a tokenSecret in options or an APPROVAL_TOKEN_SECRET env var (${MIN_TOKEN_SECRET_LENGTH}+ characters)`,
    )
  }

  // Group slugs must be unique.
  const slugs = options.groups.map((g) => g.slug)
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i)
  if (dupes.length > 0) {
    throw new Error(
      `approvalsPlugin: duplicate group slug${dupes.length === 1 ? '' : 's'}: ${dupes.join(', ')}`,
    )
  }

  return { ...options, tokenSecret: secret }
}
