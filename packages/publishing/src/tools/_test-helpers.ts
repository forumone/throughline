import { vi } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import type { AuditWriter } from '@forumone/throughline-core'
import type { Logger, McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { PublishingPluginOptions } from '../options.js'

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

export const fakeContext: McpToolContext = {
  user: {
    id: 'u1',
    email: 'tester@example.com',
    name: 'Tester',
    roles: ['admin'],
    groups: [],
  },
  apiKeyName: 'test-key',
  logger: noopLogger,
}

export interface MakeDepsOverrides {
  document?: Record<string, unknown>
  payloadFindByID?: ReturnType<typeof vi.fn>
  payloadUpdate?: ReturnType<typeof vi.fn>
  payloadFindVersions?: ReturnType<typeof vi.fn>
  payloadRestoreVersion?: ReturnType<typeof vi.fn>
  inngestSend?: ReturnType<typeof vi.fn>
  audit?: ReturnType<typeof vi.fn>
  options?: Partial<PublishingPluginOptions>
}

export function makeDeps(overrides: MakeDepsOverrides = {}) {
  const document = overrides.document ?? {}
  const payloadFindByID = overrides.payloadFindByID ?? vi.fn(async () => document)
  const payloadUpdate = overrides.payloadUpdate ?? vi.fn(async () => document)
  const payloadFindVersions =
    overrides.payloadFindVersions ?? vi.fn(async () => ({ docs: [], totalDocs: 0 }))
  const payloadRestoreVersion =
    overrides.payloadRestoreVersion ?? vi.fn(async () => document)
  const inngestSend = overrides.inngestSend ?? vi.fn(async () => ({}))
  const auditWriter = (overrides.audit ?? vi.fn(async () => {})) as AuditWriter
  const auditMock = auditWriter as unknown as ReturnType<typeof vi.fn>

  const payload = {
    findByID: payloadFindByID,
    update: payloadUpdate,
    findVersions: payloadFindVersions,
    restoreVersion: payloadRestoreVersion,
  } as unknown as Payload

  const inngest = { send: inngestSend } as unknown as Inngest

  const options: PublishingPluginOptions = {
    collections: [{ slug: 'pages' }],
    inngest,
    ...overrides.options,
  }

  return {
    payload,
    options,
    auditWriter,
    auditMock,
    spies: { payloadFindByID, payloadUpdate, payloadFindVersions, payloadRestoreVersion, inngestSend },
  }
}

/** Runs a tool's handler with a fake context after parsing input through its schema. */
export async function callTool<I extends Record<string, unknown>>(
  tool: McpToolDefinition,
  args: I,
): Promise<unknown> {
  const parsed = tool.inputSchema.parse(args)
  return tool.handler(parsed, fakeContext)
}

export function attachComponentValidator(
  payload: Payload,
  validator: (input: { blocks: Array<{ type: string; variant?: string }> }) =>
    | Promise<{ valid: boolean; issues: Array<{ severity: 'error' | 'warning'; rule: string; message: string; blockIndex?: number }> }>
    | { valid: boolean; issues: Array<{ severity: 'error' | 'warning'; rule: string; message: string; blockIndex?: number }> },
) {
  const symbol = Symbol.for('@forumone/throughline/components-validator')
  Object.defineProperty(payload, symbol, {
    value: validator,
    enumerable: false,
    writable: true,
    configurable: true,
  })
}
