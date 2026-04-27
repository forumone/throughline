export { emailPlugin, getEmailClient, getEmailFunctions } from './plugin.js'

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

export {
  createNotifyApprovalRequestFunction,
  createNotifyApprovalDecisionFunction,
  createNotifyApprovalExpiredFunction,
} from './functions/index.js'

export {
  EmailLayout,
  ApprovalRequestEmail,
  ApprovalDecisionEmail,
  ApprovalExpiredEmail,
} from './templates/index.js'
export type {
  ApprovalRequestEmailProps,
  ApprovalDecisionEmailProps,
  ApprovalDecisionKind,
  ApprovalExpiredEmailProps,
  ApprovalTargetKind,
  EmailLayoutProps,
} from './templates/index.js'
