import type { McpToolContext } from '@forumone/throughline-plugin-contract'

/**
 * Default read-access predicate. Admins and editors can read everything;
 * anyone else is treated as scoped to their own actions and gets a
 * "permission-denied" envelope from broad-scope tools.
 */
export function isAuditReader(ctx: McpToolContext): boolean {
  if (!ctx.user) return false
  const roles = ctx.user.roles
  return roles.includes('admin') || roles.includes('editor')
}

// `deniedEnvelope` lives in core: three servers had identical copies.
export { deniedEnvelope } from '@forumone/throughline-core'
