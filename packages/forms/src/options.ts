import type { Inngest } from 'inngest'
import type { BaseCorePluginOptions } from '@forumone/throughline-plugin-contract'

export type DestinationType = 'email' | 'webhook'

export interface AllowedDestination {
  type: DestinationType
  /** For email: recipient address. For webhook: full HTTPS URL. */
  value: string
  /** Admin-facing description. Surfaces in the destinations admin UI. */
  description: string
  /**
   * Label Claude sees when listing destinations and references when
   * creating / updating forms. Must be unique across the allowlist.
   */
  label: string
}

export interface FormsPluginOptions extends BaseCorePluginOptions {
  /** Inngest client used to fire `form/submission.received` and friends. */
  inngest: Inngest
  /**
   * Pre-authorized destinations. Forms can only route submissions to one
   * of these. Adding a destination requires editing the plugin config and
   * redeploying — that friction is the security model. See README.
   */
  allowedDestinations: AllowedDestination[]
  /**
   * Default privacy notice shown above the submit button. Customize for
   * the deployment's jurisdiction (GDPR, CCPA, etc.). Legal review
   * recommended before shipping forms publicly.
   */
  defaultPrivacyNotice?: string
  /** Default for the per-form `requiresExplicitConsent` field. Default: `true`. */
  requireConsentByDefault?: boolean
  /** Max submissions per IP per hour per form. Default: `5`. */
  rateLimit?: number
  /**
   * Secret used to HMAC-hash submitter IPs. Falls back to
   * `process.env.FORMS_IP_HASH_SECRET`. Must be at least 32 characters so
   * two deployments don't collide on the same IP → hash mapping.
   */
  ipHashSecret?: string
  /**
   * Override the Forms collection slug. Default: `'forms'`. Match the
   * default Form Builder plugin uses unless you intentionally renamed it.
   */
  formsCollectionSlug?: string
  /**
   * Override the Form Submissions collection slug. Default: `'form-submissions'`.
   */
  submissionsCollectionSlug?: string
  /**
   * Route prefix for the public submit endpoint and the MCP endpoint.
   * Payload prepends `/api`, so the defaults land at `/api/forms/submit`
   * and `/api/forms/mcp`.
   */
  routePrefix?: string
}

export const DEFAULT_FORMS_SLUG = 'forms'
export const DEFAULT_FORM_SUBMISSIONS_SLUG = 'form-submissions'
export const DEFAULT_RATE_LIMIT = 5
export const MIN_IP_HASH_SECRET_LENGTH = 32

export const DEFAULT_PRIVACY_NOTICE =
  'By submitting this form, the information you provide will be used to respond to your inquiry. ' +
  'We do not sell or share your information with third parties. See our privacy policy for details.'

export interface ResolvedFormsConfig {
  options: FormsPluginOptions
  ipHashSecret: string
  formsCollectionSlug: string
  submissionsCollectionSlug: string
  routePrefix: string
  rateLimit: number
  requireConsentByDefault: boolean
  defaultPrivacyNotice: string
  destinationLabels: string[]
}

export function validateOptions(options: FormsPluginOptions): ResolvedFormsConfig {
  if (!options.inngest) {
    throw new Error('formsPlugin requires an Inngest client (`options.inngest`).')
  }
  if (!Array.isArray(options.allowedDestinations) || options.allowedDestinations.length === 0) {
    throw new Error(
      'formsPlugin requires at least one entry in `options.allowedDestinations`. The allowlist is the security perimeter — Claude can only route submissions to destinations on this list.',
    )
  }

  const labels = new Set<string>()
  for (const dest of options.allowedDestinations) {
    if (!dest.label || typeof dest.label !== 'string') {
      throw new Error(`Allowed destination is missing a label: ${JSON.stringify(dest)}`)
    }
    if (labels.has(dest.label)) {
      throw new Error(`Duplicate destination label "${dest.label}" — labels must be unique.`)
    }
    labels.add(dest.label)

    if (dest.type === 'email') {
      if (!dest.value || !dest.value.includes('@')) {
        throw new Error(
          `Allowed destination "${dest.label}" is type "email" but value is not a valid address.`,
        )
      }
    } else if (dest.type === 'webhook') {
      let url: URL
      try {
        url = new URL(dest.value)
      } catch {
        throw new Error(`Allowed webhook destination "${dest.label}" is not a valid URL.`)
      }
      if (url.protocol !== 'https:') {
        throw new Error(`Allowed webhook destination "${dest.label}" must use https://.`)
      }
    } else {
      throw new Error(
        `Allowed destination "${dest.label}" has unknown type "${(dest as { type?: string }).type}".`,
      )
    }
  }

  const ipHashSecret = options.ipHashSecret ?? process.env['FORMS_IP_HASH_SECRET']
  if (!ipHashSecret || ipHashSecret.length < MIN_IP_HASH_SECRET_LENGTH) {
    throw new Error(
      `formsPlugin requires \`options.ipHashSecret\` or \`FORMS_IP_HASH_SECRET\` env var (>=${MIN_IP_HASH_SECRET_LENGTH} characters).`,
    )
  }

  const routePrefix = options.routePrefix ?? '/forms'
  return {
    options,
    ipHashSecret,
    formsCollectionSlug: options.formsCollectionSlug ?? DEFAULT_FORMS_SLUG,
    submissionsCollectionSlug:
      options.submissionsCollectionSlug ?? DEFAULT_FORM_SUBMISSIONS_SLUG,
    routePrefix,
    rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    requireConsentByDefault: options.requireConsentByDefault ?? true,
    defaultPrivacyNotice: options.defaultPrivacyNotice ?? DEFAULT_PRIVACY_NOTICE,
    destinationLabels: options.allowedDestinations.map((d) => d.label),
  }
}
