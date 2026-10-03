import { describe, expect, it } from 'vitest'
import { AUDIT_MCP_SERVERS } from '../audit/types.js'
import { auditServerFor, mcpServerRefusal } from './audit-server.js'

/*
Audit 12 H3's `system.error` had a name and no writer. The wiring that gave it
one has to cross two naming schemes, and this file is the assertion that they
stay reconciled — because the failure mode when they do not is a swallowed
Payload validation error and a server silently missing from the log.

The six names are the ones the six plugins pass to `collector.add`. They are
string literals in six files this package cannot import without a dependency
cycle, so they are restated here: if a plugin renames its server, this list is
where that shows up.
*/
const COLLECTOR_SERVER_NAMES = [
  'approvals',
  'audit',
  'components',
  'forms',
  'integrations',
  'publishing',
] as const

describe('auditServerFor', () => {
  it('maps every server name the plugins actually pass', () => {
    for (const name of COLLECTOR_SERVER_NAMES) {
      expect(auditServerFor(name), name).toBeDefined()
    }
  })

  it('only ever returns a value the Postgres enum accepts', () => {
    for (const name of COLLECTOR_SERVER_NAMES) {
      expect(AUDIT_MCP_SERVERS).toContain(auditServerFor(name))
    }
  })

  it('is not the identity function, which is the whole reason it exists', () => {
    // The components server declares itself `components`; the audit enum's
    // value is `component`. `serverName as AuditMcpServer` compiles and writes
    // a row Payload rejects.
    expect(auditServerFor('components')).toBe('component')
    expect(AUDIT_MCP_SERVERS).not.toContain('components')
  })

  it('refuses an unknown name rather than guessing one', () => {
    expect(auditServerFor('narration')).toBeUndefined()
    expect(auditServerFor('')).toBeUndefined()
  })

  it('does not inherit anything from Object.prototype', () => {
    // A bare `Record<string, …>` lookup answers for `constructor` and
    // `toString` unless the map is null-prototyped or the keys are checked.
    // Either fix is fine; a truthy answer here is not.
    expect(auditServerFor('constructor')).toBeUndefined()
    expect(auditServerFor('toString')).toBeUndefined()
  })
})

describe('mcpServerRefusal', () => {
  it('names the offending server and both lists to reconcile', () => {
    const message = mcpServerRefusal('narration')

    expect(message).toContain('"narration"')
    expect(message).toContain('audit-server.ts')
    // Both vocabularies, so the reader can see which side is missing the name.
    expect(message).toContain('publishing')
    expect(message).toContain('component')
    // And the migration, because adding an enum value is a schema change in
    // the host and forgetting it makes the row unwritable at runtime.
    expect(message).toContain('enum_audit_events_mcp_server')
  })
})
