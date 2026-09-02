import type { McpToolContext } from '@forumone/throughline-plugin-contract'

export function isFormsAuthor(ctx: McpToolContext): boolean {
  if (!ctx.user) return false
  const roles = ctx.user.roles
  return roles.includes('admin') || roles.includes('editor')
}

export function isPiiReader(ctx: McpToolContext): boolean {
  if (!ctx.user) return false
  const roles = ctx.user.roles
  return roles.includes('admin') || roles.includes('form-admin')
}

// `deniedEnvelope` lives in core: three servers had identical copies.
export { deniedEnvelope } from '@forumone/throughline-core'
