import { describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload, PayloadRequest } from 'payload'
import { createActionEndpoint } from './action.js'
import { generateActionToken } from '../tokens.js'
import type { ApprovalsPluginOptions } from '../options.js'

const SECRET = 'a'.repeat(32)

const baseToken = {
  approvalId: 'apr_1',
  action: 'approve' as const,
  approverId: 'usr_2',
  issuedAt: 1_700_000_000_000,
}

interface MakeArgsOverrides {
  approval?: Record<string, unknown>
  payloadFindByID?: ReturnType<typeof vi.fn>
  payloadUpdate?: ReturnType<typeof vi.fn>
}

function makeArgs(overrides: MakeArgsOverrides = {}) {
  const approval = overrides.approval ?? {
    id: 'apr_1',
    status: 'pending',
    targetCollection: 'pages',
    targetId: 'p1',
    targetTitle: 'Climate program',
    changesSummary: 'New copy and stats.',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    consumedTokens: [],
  }
  const payloadFindByID =
    overrides.payloadFindByID ?? vi.fn(async () => approval)
  const payloadUpdate = overrides.payloadUpdate ?? vi.fn(async () => approval)
  const inngestSend = vi.fn(async () => ({}))
  const audit = vi.fn(async () => {})

  const payload = {
    findByID: payloadFindByID,
    update: payloadUpdate,
  } as unknown as Payload
  const inngest = { send: inngestSend } as unknown as Inngest

  const options: ApprovalsPluginOptions & { tokenSecret: string } = {
    groups: [{ slug: 'editorial', name: 'Editorial' }],
    groupResolver: { resolveUsers: async () => [] },
    inngest,
    tokenSecret: SECRET,
  }

  return {
    options,
    audit,
    spies: { payloadFindByID, payloadUpdate, inngestSend, audit },
    payload,
  }
}

async function callEndpoint(deps: ReturnType<typeof makeArgs>, urlString: string) {
  const endpoint = createActionEndpoint({
    options: deps.options,
    auditWriter: deps.audit as never,
  })
  const handler = endpoint.handler as (req: PayloadRequest) => Promise<Response>
  const req = { url: urlString, payload: deps.payload } as unknown as PayloadRequest
  return handler(req)
}

describe('createActionEndpoint', () => {
  it('returns 400 when token is missing', async () => {
    const deps = makeArgs()
    const response = await callEndpoint(deps, 'https://example.com/api/approvals/action')
    expect(response.status).toBe(400)
  })

  it('returns 401 for invalid tokens', async () => {
    const deps = makeArgs()
    const response = await callEndpoint(
      deps,
      'https://example.com/api/approvals/action?token=garbage',
    )
    expect(response.status).toBe(401)
  })

  it('renders a confirmation page on first valid hit (no confirm=true)', async () => {
    const token = await generateActionToken(
      { ...baseToken, issuedAt: Date.now() },
      SECRET,
    )
    const deps = makeArgs()
    const response = await callEndpoint(
      deps,
      `https://example.com/api/approvals/action?token=${encodeURIComponent(token)}`,
    )
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Confirm: Approve')
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })

  it('records the decision and fires events when confirmed', async () => {
    const token = await generateActionToken(
      { ...baseToken, issuedAt: Date.now() },
      SECRET,
    )
    const deps = makeArgs()
    const response = await callEndpoint(
      deps,
      `https://example.com/api/approvals/action?token=${encodeURIComponent(token)}&confirm=true`,
    )
    expect(response.status).toBe(200)

    const updateArgs = deps.spies.payloadUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(updateArgs.data['status']).toBe('granted')
    expect(updateArgs.data['consumedTokens']).toEqual([token])

    const eventArgs = deps.spies.inngestSend.mock.calls[0]?.[0] as { name: string }
    expect(eventArgs.name).toBe('approval/decided')

    const auditArgs = deps.spies.audit.mock.calls[0]?.[0] as { action: string }
    expect(auditArgs.action).toBe('approval.granted')
  })

  it('rejects a token that has already been consumed', async () => {
    const token = await generateActionToken(
      { ...baseToken, issuedAt: Date.now() },
      SECRET,
    )
    const deps = makeArgs({
      approval: {
        id: 'apr_1',
        status: 'pending',
        consumedTokens: [token],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    })
    const response = await callEndpoint(
      deps,
      `https://example.com/api/approvals/action?token=${encodeURIComponent(token)}&confirm=true`,
    )
    expect(response.status).toBe(400)
    const body = await response.text()
    expect(body).toContain('already been used')
  })

  it('shows an "already decided" message when the approval is no longer pending', async () => {
    const token = await generateActionToken(
      { ...baseToken, issuedAt: Date.now() },
      SECRET,
    )
    const deps = makeArgs({
      approval: { id: 'apr_1', status: 'declined', consumedTokens: [] },
    })
    const response = await callEndpoint(
      deps,
      `https://example.com/api/approvals/action?token=${encodeURIComponent(token)}&confirm=true`,
    )
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('already declined')
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })
})
