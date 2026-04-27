export { approvalsPlugin } from './plugin.js'

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

export {
  APPROVALS_RESOLVER_SYMBOL,
  attachApprovalResolver,
  createApprovalResolver,
} from './resolver.js'
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
