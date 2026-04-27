// Plugin and surface types are re-exported here as they are added during C7.
// Currently only the options surface is exported.

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
