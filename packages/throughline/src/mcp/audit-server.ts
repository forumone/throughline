import { AUDIT_MCP_SERVERS, type AuditMcpServer } from '../audit/types.js'

/*
The collector's server names are not the audit log's server names, and one pair
disagrees.

`collector.ts` takes a `serverName` for its error messages — the string a
plugin passes to `declare` and `add`. The audit collection takes an
`mcpServer`, a Postgres enum (`enum_audit_events_mcp_server`). Six of the seven
names line up. The seventh does not:

    collector          audit enum
    approvals          approvals
    audit              audit
    components   ->    component      <- singular
    forms              forms
    integrations       integrations
    publishing         publishing
    -                  payload

So `mcpServer: serverName as AuditMcpServer` compiles and is wrong for the
components server. It would be wrong *silently*: Payload rejects a select value
outside the options, `createAuditWriter` swallows every write failure by design
— "never let audit failures break the original action" — and the result is one
server whose rows are missing from the log with a `logger.error` nobody reads.

Hence a map, and hence `auditServerFor` refusing rather than guessing. The
refusal happens where the map is consulted, which is `add` — config time, once,
at boot — rather than inside a request.
*/
const AUDIT_SERVER_BY_COLLECTOR_NAME: Readonly<Record<string, AuditMcpServer>> = {
  approvals: 'approvals',
  audit: 'audit',
  components: 'component',
  forms: 'forms',
  integrations: 'integrations',
  payload: 'payload',
  publishing: 'publishing',
}

/**
 * The audit log's name for a collector server name, or `undefined` if there
 * isn't one.
 *
 * `undefined` rather than a fallback: a row attributed to the wrong server is
 * worse than a boot that stops and says which two lists to reconcile. The
 * caller is `collector.add`, which throws — see `mcpServerRefusal`.
 */
export function auditServerFor(serverName: string): AuditMcpServer | undefined {
  /*
  `hasOwn` rather than a bare index, because a bare index into an object
  literal answers for `constructor` and `toString` — and the return type says
  `AuditMcpServer | undefined`, so `auditServerFor('constructor')` would hand
  back `Object` typed as a Postgres enum value and pass every check between
  here and the insert.
  */
  return Object.hasOwn(AUDIT_SERVER_BY_COLLECTOR_NAME, serverName)
    ? AUDIT_SERVER_BY_COLLECTOR_NAME[serverName]
    : undefined
}

/** The message `collector.add` throws with when a server has no audit name. */
export function mcpServerRefusal(serverName: string): string {
  return (
    `MCP server "${serverName}" passed an audit writer but has no name in the audit log's ` +
    `mcpServer enum, so a \`system.error\` row for its tools could not be written. ` +
    `Known collector names: ${Object.keys(AUDIT_SERVER_BY_COLLECTOR_NAME).join(', ')}. ` +
    `Audit enum values: ${AUDIT_MCP_SERVERS.join(', ')}. Add "${serverName}" to the map in ` +
    `core/src/mcp/audit-server.ts, and — if the enum needs a new value — to AUDIT_MCP_SERVERS ` +
    `with a migration in the host that adds it to enum_audit_events_mcp_server.`
  )
}
