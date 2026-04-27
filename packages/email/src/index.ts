// Plugin and template exports land in subsequent commits.

export { createEmailClient } from './client.js'
export type {
  EmailClient,
  EmailClientOptions,
  SendEmailParams,
  SendEmailResult,
  TemplateRenderer,
} from './client.js'

export { defaultTokens, mergeTokens } from './tokens.js'
export type { EmailBrandTokens } from './tokens.js'

export { DEFAULT_APPROVALS_COLLECTION_SLUG, validateOptions } from './options.js'
export type {
  ApprovalActionKind,
  BuildActionUrlArgs,
  EmailPluginOptions,
  ResolvedEmailEnv,
  ResolvedRecipient,
} from './options.js'
