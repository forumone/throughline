import type { Payload } from 'payload'
import type { Inngest } from 'inngest'
import type { McpToolContext } from '@forumone/throughline-plugin-contract'

export interface FakeInstance {
  id: string
  name: string
  integrationType: string
  enabled?: boolean
  config?: Record<string, unknown>
  lastSyncAt?: string
  lastSyncStatus?: string
  lastError?: string
}

interface FindCall {
  collection: string
  where?: { and?: Array<Record<string, Record<string, unknown>>> }
  sort?: string
  limit?: number
}

interface SendCall {
  name: string
  data: unknown
}

export function createFakePayload(instances: FakeInstance[]): {
  payload: Payload
  finds: FindCall[]
} {
  const finds: FindCall[] = []
  const payload = {
    find: async (args: FindCall) => {
      finds.push(args)
      const filtered = instances.filter((inst) =>
        (args.where?.and ?? []).every((cond) => matchCondition(inst, cond)),
      )
      return {
        docs: filtered.slice(0, args.limit ?? 100),
        totalDocs: filtered.length,
        page: 1,
        totalPages: 1,
        limit: args.limit ?? 100,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
        pagingCounter: 1,
      }
    },
    findByID: async ({ id }: { id: string }) => {
      const found = instances.find((inst) => inst.id === id)
      if (!found) throw new Error('Not found')
      return found
    },
  } as unknown as Payload
  return { payload, finds }
}

/** `failWith` stands in for an Inngest that will not take the event. */
export function createFakeInngest(failWith?: Error): { inngest: Inngest; sends: SendCall[] } {
  const sends: SendCall[] = []
  const inngest = {
    send: async (event: SendCall) => {
      if (failWith) throw failWith
      sends.push(event)
    },
  } as unknown as Inngest
  return { inngest, sends }
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

function matchCondition(
  instance: FakeInstance,
  condition: Record<string, Record<string, unknown>>,
): boolean {
  const [field, ops] = Object.entries(condition)[0] ?? ['', {}]
  if (!field) return true
  const value = (instance as unknown as Record<string, unknown>)[field]
  for (const [op, operand] of Object.entries(ops)) {
    if (op === 'equals' && value !== operand) return false
  }
  return true
}
