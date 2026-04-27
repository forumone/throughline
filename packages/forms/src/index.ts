// Plugin and other surface exports land in subsequent commits.

export {
  DEFAULT_FORMS_SLUG,
  DEFAULT_FORM_SUBMISSIONS_SLUG,
  DEFAULT_PRIVACY_NOTICE,
  DEFAULT_RATE_LIMIT,
  MIN_IP_HASH_SECRET_LENGTH,
  validateOptions,
} from './options.js'
export type {
  AllowedDestination,
  DestinationType,
  FormsPluginOptions,
  ResolvedFormsConfig,
} from './options.js'

export { listDestinations, validateDestinationLabel } from './destinations.js'
export type { DestinationLookupResult } from './destinations.js'

export { addFormPolicyFields } from './policy-fields.js'
export type { PolicyFieldsOptions } from './policy-fields.js'
