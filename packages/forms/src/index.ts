export { formsPlugin, getFormsFunctions } from './plugin.js'

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

export {
  createCreateFormTool,
  createUpdateFormFieldsTool,
  createUpdateFormDestinationsTool,
  createGetFormSubmissionsTool,
  createValidateFormTool,
  createListAllowedDestinationsTool,
} from './tools/index.js'

export {
  createFormFanOutFunction,
  createEmailDestinationFunction,
  createWebhookDestinationFunction,
  createSubmitterConfirmationFunction,
} from './functions/index.js'

export {
  FormsLayout,
  FormSubmissionEmail,
  SubmitterConfirmationEmail,
} from './templates/index.js'
export type {
  FormsLayoutProps,
  FormSubmissionEmailProps,
  SubmitterConfirmationEmailProps,
  FormSubmissionField,
} from './templates/index.js'
