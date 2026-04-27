import { vi } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import type { AuditWriter } from '@forumone/throughline-core'
import type { Logger, McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { ApprovalsPluginOptions, ResolvedApprover } from '../options.js'

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

export function makeContext(overrides: Partial<McpToolContext> = {}): McpToolContext {
  return {
    user: {
      id: 'usr_1',
      email: 'tester@example.com',
      name: 'Tester',
      roles: ['editor'],
      groups: ['editorial'],
    },
    apiKeyName: 'test-key',
    logger: noopLogger,
    ...overrides,
  }
}

export interface MakeDepsOverrides {
  document?: Record<string, unknown>
  approval?: Record<string, unknown>
  approvers?: ResolvedApprover[]
  payloadFindByID?: ReturnType<typeof vi.fn>
  payloadFind?: ReturnType<typeof vi.fn>
  payloadCreate?: ReturnType<typeof vi.fn>
  payloadUpdate?: ReturnType<typeof vi.fn>
  inngestSend?: ReturnType<typeof vi.fn>
  audit?: ReturnType<typeof vi.fn>
  optionsOverrides?: Partial<ApprovalsPluginOptions>
}

export function makeDeps(overrides: MakeDepsOverrides = {}) {
  const document = overrides.document ?? {
    id: 'p1',
    title: 'Climate program page',
    slug: 'climate-program',
    updatedAt: '2026-04-23T12:00:00.000Z',
  }
  const approval = overrides.approval ?? {}
  const approvers = overrides.approvers ?? [
    { id: 'usr_2', email: 'reviewer@example.com', name: 'Reviewer' },
  ]

  const payloadFindByID =
    overrides.payloadFindByID ??
    vi.fn(async (args: { collection: string }) => {
      if (args.collection === 'approvals') return approval
      return document
    })
  const payloadFind = overrides.payloadFind ?? vi.fn(async () => ({ docs: [], totalDocs: 0 }))
  const payloadCreate = overrides.payloadCreate ?? vi.fn(async () => ({ id: 'apr_1' }))
  const payloadUpdate = overrides.payloadUpdate ?? vi.fn(async () => approval)
  const inngestSend = overrides.inngestSend ?? vi.fn(async () => ({}))
  const auditWriter = (overrides.audit ?? vi.fn(async () => {})) as AuditWriter
  const auditMock = auditWriter as unknown as ReturnType<typeof vi.fn>

  const payload = {
    findByID: payloadFindByID,
    find: payloadFind,
    create: payloadCreate,
    update: payloadUpdate,
  } as unknown as Payload

  const inngest = { send: inngestSend } as unknown as Inngest

  const options: ApprovalsPluginOptions & { tokenSecret: string } = {
    groups: [
      { slug: 'editorial', name: 'Editorial' },
      { slug: 'legal', name: 'Legal' },
    ],
    groupResolver: { resolveUsers: async () => approvers },
    inngest,
    tokenSecret: 'a'.repeat(32),
    expirationDays: 7,
    publicUrl: 'https://example.com',
    ...overrides.optionsOverrides,
  }

  return {
    payload,
    options,
    auditWriter,
    auditMock,
    spies: {
      payloadFindByID,
      payloadFind,
      payloadCreate,
      payloadUpdate,
      inngestSend,
    },
  }
}

export async function callTool<I extends Record<string, unknown>>(
  tool: McpToolDefinition,
  args: I,
  ctx: McpToolContext = makeContext(),
): Promise<unknown> {
  const parsed = tool.inputSchema.parse(args)
  return tool.handler(parsed, ctx)
}
