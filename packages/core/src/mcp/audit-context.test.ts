import type { Logger, McpToolContext } from '@forumone/throughline-plugin-contract'
import { describe, expect, it } from 'vitest'
import { auditContext } from './audit-context.js'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  roles: ['editor'],
  groups: [],
}

function context(overrides: Partial<McpToolContext> = {}): McpToolContext {
  return { user, apiKeyName: 'test-key', logger, ...overrides }
}

describe('auditContext', () => {
  it('records a call carrying a user as that user', () => {
    expect(auditContext(context()).actor).toEqual({
      type: 'user',
      userId: 'u1',
      userName: 'Ada',
      apiKeyName: 'test-key',
      sessionId: undefined,
    })
  })

  /*
  The defect this helper exists for. Three component tools wrote `type: 'user'`
  unconditionally, so a key with no linked user was logged as a person — and an
  audit log that cannot tell an agent from an editor is not an audit log. The
  rule is the one `publishing`'s service already used.
  */
  it('records a call with no user as the system, not as a person', () => {
    const { actor } = auditContext(context({ user: null }))

    expect(actor.type).toBe('system')
    expect(actor.userId).toBeUndefined()
    expect(actor.userName).toBeUndefined()
    // The key still names itself. A system actor is not an anonymous one.
    expect(actor.apiKeyName).toBe('test-key')
  })

  /*
  The column has been on the audit collection since it was written and nothing
  ever filled it. It is what lets a reader group one conversation's writes.
  */
  it('carries the MCP session through, so a log can be read by conversation', () => {
    expect(auditContext(context({ sessionId: 'sess-42' })).actor.sessionId).toBe('sess-42')
  })

  it('maps the client meta onto the audit fields', () => {
    expect(
      auditContext(context(), {
        userPrompt: 'make the hero say something else',
        reasoning: 'the current heading repeats the page title',
        changesSummary: 'Replaced the hero heading',
      }),
    ).toMatchObject({
      prompt: 'make the hero say something else',
      reasoning: 'the current heading repeats the page title',
      changesSummary: 'Replaced the hero heading',
    })
  })

  it('leaves the narrative fields unset when the client sent no meta', () => {
    const fields = auditContext(context())

    expect(fields.prompt).toBeUndefined()
    expect(fields.reasoning).toBeUndefined()
    expect(fields.changesSummary).toBeUndefined()
  })
})
