/**
 * `@forumone/throughline/approvals`: approval requests, the resolver
 * publishing consults, signed action links, and the job that expires stale
 * requests. Was `@forumone/throughline-approvals` in 0.x.
 */
export { approvalsPlugin } from './plugin.js'
export { approvalsEnv } from './options.js'

export type {
  ApprovalsPluginOptions,
  ApproverGroup,
  GroupResolver,
  ResolvedApprover,
} from './options.js'

export {
  DEFAULT_APPROVALS_SLUG,
  createApprovalsCollection,
} from './collection.js'
export type { CreateApprovalsCollectionOptions } from './collection.js'

export { attachApprovalResolver, createApprovalResolver } from './resolver.js'
export type { CreateApprovalResolverOptions } from './resolver.js'

export { createActionEndpoint } from './endpoints/action.js'
export type { CreateActionEndpointDeps } from './endpoints/action.js'

export {
  generateActionToken,
  verifyActionToken,
  buildActionUrl,
} from './tokens.js'
export type {
  ActionToken,
  ActionTokenAction,
  VerifyOptions,
  VerifyResult,
} from './tokens.js'

export { expireStaleApprovalsJob } from './jobs/expire-stale-approvals.js'
export type { ExpireStaleApprovalsOptions } from '../jobs/workflow-types.js'
