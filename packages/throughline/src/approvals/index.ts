/**
 * `@forumone/throughline/approvals`. For now the expiry job alone; the
 * approvals plugin moves in from `@forumone/throughline-approvals` in the next
 * 1.0 step (docs/spec/1.0-exports.md).
 */
export { expireStaleApprovalsJob } from './jobs/expire-stale-approvals.js'
export type { ExpireStaleApprovalsOptions } from '../jobs/workflow-types.js'
