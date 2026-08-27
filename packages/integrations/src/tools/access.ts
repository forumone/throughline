import type { McpToolContext } from '@forumone/throughline-plugin-contract'

export function isIntegrationsReader(ctx: McpToolContext): boolean {
  if (!ctx.user) return false
  const roles = ctx.user.roles
  return roles.includes('admin') || roles.includes('editor')
}

export function isIntegrationsAdmin(ctx: McpToolContext): boolean {
  if (!ctx.user) return false
  return ctx.user.roles.includes('admin')
}

// `deniedEnvelope` lives in core: three servers had identical copies.
export { deniedEnvelope } from '@forumone/throughline-core'
