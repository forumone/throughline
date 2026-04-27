import type { Payload } from 'payload'
import type { McpToolContext } from '@forumone/throughline-plugin-contract'

export interface FakeAuditDoc {
  id: string
  createdAt: string
  actor: { type: string; userId?: string; userName?: string; apiKeyName?: string }
  action: string
  mcpServer: string
  mcpTool: string
  targetCollection?: string
  targetId?: string
  targetTitle?: string
  summary: string
  success?: boolean
  errorMessage?: string
  prompt?: string
  reasoning?: string
  changesSummary?: string
  diff?: Record<string, { before: unknown; after: unknown }>
}

interface FindCall {
  collection: string
  where?: { and?: Array<Record<string, Record<string, unknown>>> }
  sort?: string
  limit?: number
}

/**
 * Fake Payload that can hold a fixed set of audit docs and applies the
 * subset of `where` filters our tools actually use (`equals`,
 * `greater_than_equal`, `less_than_equal`).
 */
export function createFakePayload(docs: FakeAuditDoc[]): {
  payload: Payload
  calls: FindCall[]
} {
  const calls: FindCall[] = []

  const payload = {
    find: async (args: FindCall) => {
      calls.push(args)
      const filtered = applyFilters(docs, args.where?.and ?? [])
      const sorted = sortDocs(filtered, args.sort ?? '-createdAt')
      const limit = args.limit ?? 100
      return {
        docs: sorted.slice(0, limit),
        totalDocs: sorted.length,
        page: 1,
        totalPages: 1,
        limit,
        hasNextPage: sorted.length > limit,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
        pagingCounter: 1,
      }
    },
  } as unknown as Payload

  return { payload, calls }
}

function applyFilters(
  docs: FakeAuditDoc[],
  conditions: Array<Record<string, Record<string, unknown>>>,
): FakeAuditDoc[] {
  return docs.filter((doc) => conditions.every((condition) => matchesCondition(doc, condition)))
}

function matchesCondition(
  doc: FakeAuditDoc,
  condition: Record<string, Record<string, unknown>>,
): boolean {
  const [field, ops] = Object.entries(condition)[0] ?? ['', {}]
  if (!field) return true

  const value = readField(doc, field)

  for (const [op, operand] of Object.entries(ops)) {
    if (op === 'equals' && value !== operand) return false
    if (op === 'greater_than_equal' && !(typeof value === 'string' && value >= String(operand))) return false
    if (op === 'less_than_equal' && !(typeof value === 'string' && value <= String(operand))) return false
  }
  return true
}

function readField(doc: FakeAuditDoc, path: string): unknown {
  if (!path.includes('.')) return (doc as unknown as Record<string, unknown>)[path]
  const [head, ...rest] = path.split('.')
  let cursor: unknown = (doc as unknown as Record<string, unknown>)[head!]
  for (const segment of rest) {
    if (cursor && typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return cursor
}

function sortDocs(docs: FakeAuditDoc[], sort: string): FakeAuditDoc[] {
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  const sorted = [...docs].sort((a, b) => {
    const av = String((a as unknown as Record<string, unknown>)[field] ?? '')
    const bv = String((b as unknown as Record<string, unknown>)[field] ?? '')
    if (av < bv) return desc ? 1 : -1
    if (av > bv) return desc ? -1 : 1
    return 0
  })
  return sorted
}

export function makeContext(overrides: Partial<McpToolContext> = {}): McpToolContext {
  const user =
    'user' in overrides
      ? overrides.user!
      : {
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: ['admin'],
          groups: [],
        }
  return {
    user,
    apiKeyName: overrides.apiKeyName ?? 'test-key',
    ...(overrides.sessionId ? { sessionId: overrides.sessionId } : {}),
    logger: overrides.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  }
}
