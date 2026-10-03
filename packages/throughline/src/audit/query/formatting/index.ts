/**
 * Conversational-output helpers for audit records. The query tools return
 * objects shaped via `formatAuditEvent` so Claude can relay them to users
 * without reformatting raw collection JSON.
 */

export interface FormattedAuditEvent {
  when: string
  whenIso: string
  who: string
  what: string
  why?: string
  prompt?: string
  changesSummary?: string
  diff?: Record<string, { before: unknown; after: unknown }>
  success: boolean
  errorMessage?: string
  action: string
  mcpServer: string
  mcpTool: string
  targetCollection?: string
  targetId?: string
  targetTitle?: string
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

/**
 * Formats an ISO timestamp as a relative time string. Crude but
 * conversational: "just now", "5 minutes ago", "3 hours ago", "2 days ago",
 * or an `YYYY-MM-DD` for anything older than a week.
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diffMs = Math.max(0, now - then)
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (diffMs < 7 * DAY_IN_MS) return `${days} day${days === 1 ? '' : 's'} ago`
  return iso.slice(0, 10)
}

/**
 * Maps a raw audit-collection record to the conversational shape the query
 * tools return. Internal-only fields (`consumedTokens`, `notifiedApprovers`)
 * are dropped; ISO timestamps are kept alongside the relative form so the
 * caller can sort or render at their preference.
 */
export function formatAuditEvent(
  raw: Record<string, unknown>,
  now = Date.now(),
): FormattedAuditEvent {
  const actor = (raw['actor'] ?? {}) as Record<string, unknown>
  const userName = typeof actor['userName'] === 'string' ? actor['userName'] : null
  const apiKeyName = typeof actor['apiKeyName'] === 'string' ? actor['apiKeyName'] : null
  const actorType = typeof actor['type'] === 'string' ? actor['type'] : 'unknown'
  const who = userName ?? apiKeyName ?? (actorType === 'system' ? 'system' : 'unknown')

  const createdAt = typeof raw['createdAt'] === 'string' ? raw['createdAt'] : ''

  const formatted: FormattedAuditEvent = {
    when: createdAt ? formatRelativeTime(createdAt, now) : 'unknown',
    whenIso: createdAt,
    who,
    what: typeof raw['summary'] === 'string' ? raw['summary'] : String(raw['action'] ?? ''),
    success: raw['success'] !== false,
    action: typeof raw['action'] === 'string' ? raw['action'] : 'unknown',
    mcpServer: typeof raw['mcpServer'] === 'string' ? raw['mcpServer'] : 'unknown',
    mcpTool: typeof raw['mcpTool'] === 'string' ? raw['mcpTool'] : 'unknown',
  }

  if (typeof raw['reasoning'] === 'string') formatted.why = raw['reasoning']
  if (typeof raw['prompt'] === 'string') formatted.prompt = raw['prompt']
  if (typeof raw['changesSummary'] === 'string') formatted.changesSummary = raw['changesSummary']
  if (raw['diff'] && typeof raw['diff'] === 'object') {
    formatted.diff = raw['diff'] as Record<string, { before: unknown; after: unknown }>
  }
  if (typeof raw['errorMessage'] === 'string') formatted.errorMessage = raw['errorMessage']
  if (typeof raw['targetCollection'] === 'string') formatted.targetCollection = raw['targetCollection']
  if (typeof raw['targetId'] === 'string') formatted.targetId = raw['targetId']
  if (typeof raw['targetTitle'] === 'string') formatted.targetTitle = raw['targetTitle']

  return formatted
}
