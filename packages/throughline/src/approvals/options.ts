import { checkEnvValue, type McpToolCollector } from '../index.js'
import type { Inngest } from 'inngest'
import type {
  BaseCorePluginOptions,
  CollectionPluginOptions,
  EnvRequirement,
} from '../index.js'

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

export interface ApprovalsPluginOptions extends BaseCorePluginOptions, CollectionPluginOptions {
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

  /**
   * Where to put this server's MCP tools so Payload's own MCP plugin can serve
   * them.
   *
   * `createMcpToolCollector()` from `@forumone/throughline`. The host hands
   * its array to `@payloadcms/plugin-mcp` at config time and this plugin fills
   * it at `onInit` — which is the first moment the tools can exist, since they
   * close over `payload`, and still before any request reads the array.
   *
   * Omit it and nothing changes: this server keeps its own `/mcp` endpoint,
   * which is what lets a host move one server at a time.
   */
  mcpTools?: McpToolCollector
}

const TOKEN_SECRET_ENV = {
  name: 'APPROVAL_TOKEN_SECRET',
  minLength: 32,
  why:
    'Signs the approve/decline links in approval emails; approvalsPlugin will not start ' +
    'without it. Generate with `openssl rand -base64 48`. Changing it invalidates links ' +
    'already sent.',
} as const satisfies EnvRequirement

/**
 * What `approvalsPlugin` reads from the environment when the matching option is
 * omitted, and refuses to start without. Hand it to `assertEnvironment` from
 * `@forumone/throughline` so a site reports it with everything else.
 *
 * Leave it out if you pass `tokenSecret` yourself. `NEXT_PUBLIC_SERVER_URL`
 * (the `publicUrl` fallback) is not here: the plugin does not refuse to start
 * without it, so it is the site's to require.
 */
export const approvalsEnv: readonly EnvRequirement[] = [TOKEN_SECRET_ENV]

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
  // The backstop for a site that does not call `assertEnvironment`, driven by
  // the same declaration it would have passed.
  const secret = options.tokenSecret ?? process.env[TOKEN_SECRET_ENV.name]
  if (secret === undefined || checkEnvValue(TOKEN_SECRET_ENV, secret)) {
    throw new Error(
      `approvalsPlugin requires a tokenSecret in options or an ${TOKEN_SECRET_ENV.name} env var (${TOKEN_SECRET_ENV.minLength}+ characters)`,
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
