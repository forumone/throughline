/**
 * `@forumone/throughline/email`: the email plugin and its Resend client, brand
 * tokens, the three approval notifications as jobs, and their React Email
 * templates. Was `@forumone/throughline-email` (and its `/templates`) in 0.x.
 */
export { emailJobs, emailPlugin, getEmailClient } from './plugin.js'

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

export { emailEnv } from './options.js'
export type {
  ApprovalActionKind,
  BuildActionUrlArgs,
  EmailPluginOptions,
  ResolvedEmailEnv,
  ResolvedRecipient,
} from './options.js'

export {
  notifyApprovalRequestJob,
  notifyApprovalDecisionJob,
  notifyApprovalExpiredJob,
} from './functions/index.js'
export type {
  NotifyApprovalRequestJobDeps,
  NotifyApprovalDecisionJobDeps,
  NotifyApprovalExpiredJobDeps,
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
