import type { Payload } from 'payload'
import type { McpToolContext } from '@forumone/throughline-plugin-contract'
import type { Inngest } from 'inngest'
import type { FormsPluginOptions, ResolvedFormsConfig } from '../options.js'

const AUDIT_WRITER_SYMBOL = Symbol.for('@forumone/throughline/audit-writer')

export interface FakePayloadHandle {
  payload: Payload
  finds: Array<{ collection: string; where?: unknown; limit?: number }>
  creates: Array<{ collection: string; data: Record<string, unknown> }>
  updates: Array<{ collection: string; id: string; data: Record<string, unknown> }>
  audits: Array<Record<string, unknown>>
  setForm: (form: Record<string, unknown> | null) => void
  setSubmissions: (docs: Array<Record<string, unknown>>) => void
}

export function createFakePayload(initialForm: Record<string, unknown> | null = null): FakePayloadHandle {
  const finds: FakePayloadHandle['finds'] = []
  const creates: FakePayloadHandle['creates'] = []
  const updates: FakePayloadHandle['updates'] = []
  const audits: Array<Record<string, unknown>> = []
  let form = initialForm
  let submissions: Array<Record<string, unknown>> = []

  const payload = {
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      finds.push({ collection, where: { id } })
      if (collection === 'forms' && form) return { id, ...form }
      return null
    },
    find: async (args: { collection: string; limit?: number }) => {
      finds.push(args)
      const docs = submissions.slice(0, args.limit ?? submissions.length)
      return {
        docs,
        totalDocs: submissions.length,
        page: 1,
        totalPages: 1,
        limit: args.limit ?? 0,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
        pagingCounter: 1,
      }
    },
    create: async (args: { collection: string; data: Record<string, unknown> }) => {
      creates.push(args)
      return { id: `created-${creates.length}`, ...args.data }
    },
    update: async (args: { collection: string; id: string; data: Record<string, unknown> }) => {
      updates.push(args)
      return { id: args.id, ...args.data }
    },
  } as unknown as Payload

  Object.defineProperty(payload, AUDIT_WRITER_SYMBOL, {
    value: async (event: Record<string, unknown>) => {
      audits.push(event)
    },
    enumerable: false,
    writable: false,
    configurable: true,
  })

  return {
    payload,
    finds,
    creates,
    updates,
    audits,
    setForm: (next) => {
      form = next
    },
    setSubmissions: (docs) => {
      submissions = docs
    },
  }
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

export function makeResolvedConfig(overrides: Partial<ResolvedFormsConfig> = {}): ResolvedFormsConfig {
  const inngest = {} as unknown as Inngest
  const options: FormsPluginOptions = {
    inngest,
    ipHashSecret: 'a'.repeat(32),
    allowedDestinations: [
      { type: 'email', value: 'team@example.com', label: 'Main inbox', description: 'General' },
      { type: 'webhook', value: 'https://crm.example.com/leads', label: 'CRM', description: 'Leads' },
    ],
  }
  return {
    options,
    ipHashSecret: 'a'.repeat(32),
    formsCollectionSlug: 'forms',
    submissionsCollectionSlug: 'form-submissions',
    routePrefix: '/forms',
    rateLimit: 5,
    requireConsentByDefault: true,
    defaultPrivacyNotice: 'notice',
    destinationLabels: ['Main inbox', 'CRM'],
    ...overrides,
  }
}
