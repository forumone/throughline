# @forumone/throughline-core

The shared plumbing every Throughline server package depends on. Drop it into a Payload + Next.js app and you get the audit log, MCP authentication and request handling, the framework event taxonomy + Inngest client factory, env-var conventions, a logger, and a handful of small utilities.

## What's inside

| Subsystem          | Subpath           | Role                                                                                                                                                            |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit              | `./audit`         | `auditPlugin`, `createAuditCollection`, `createAuditWriter`, `getAuditWriter`, `AUDIT_ACTIONS`, `AUDIT_MCP_SERVERS`                                             |
| Events             | `./events`        | `createInngestClient`, `CoreEvents`, `FrameworkEvents` (module-augmentation seam)                                                                               |
| MCP                | `./mcp`           | `createMcpToolCollector`, `toPayloadMcpTools`, `McpMetaSchema`, `withMeta`, `auditContext`, `mcpApiKeyAccess`, `isSignedIn`, `signedIn`, `isMcpApiKeyPrincipal` |
| Environment        | `./env`           | `assertEnvironment`, `checkEnvValue`, `EnvironmentError`                                                                                                        |
| Observability      | `./observability` | `jobFailuresPlugin`, `getJobFailureWriter`, `createErrorReporter`, `reportError`, `buildRequestErrorReport`, `describeErrorReporting`                           |
| Logger             | (main)            | `defaultLogger`, `createNamedLogger`                                                                                                                            |
| Utils              | (main)            | `documentContentHash`, `sha256Hex`, `formatZodIssues`                                                                                                           |
| Payload CLI runner | bin               | `throughline-payload` — see [below](#running-the-payload-cli-throughline-payload)                                                                               |

There is no `./auth` any more. It held an MCP key collection, a bearer-token
authenticator and `createMcpHandler` — a JSON-RPC subset each plugin mounted at its
own `/mcp`. `@payloadcms/plugin-mcp` owns the transport, the keys and authentication
now; `createMcpToolCollector` is how this suite's tools get to it. `sha256Hex`
survived, under `./utils`.

The main entry re-exports everything; the subpath exports keep bundles smaller for consumers who only need one slice.

## Installation

```bash
pnpm add @forumone/throughline-core
```

Peers: `payload@^3.89.0` and `inngest@^4.0.0`.

## The audit log

Every consequential action in the framework writes to a single immutable Payload collection. Plugins do not write directly — they call the writer attached to the Payload instance by `auditPlugin`.

```ts
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { buildConfig } from 'payload'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),
    // your other Throughline plugins
  ],
})
```

In a downstream plugin's `onInit`:

```ts
import { getAuditWriter } from '@forumone/throughline-core'

onInit: async (payload) => {
  const writer = getAuditWriter(payload)
  await writer({
    actor: { type: 'user', userId: 'u1' },
    action: 'publishing.publish',
    mcpServer: 'publishing',
    mcpTool: 'publishing.publish',
    targetCollection: 'pages',
    targetId: 'p1',
    targetTitle: 'Homepage',
  })
}
```

The writer is **fire-and-forget**: failures log but never throw. Audit failures must never break the originating action.

### Sidebar group

The `audit-events` collection sits in the admin sidebar's `Throughline` group by default. `auditPlugin({ inngest, admin: { group: 'Workflow' } })` files it elsewhere; `admin: { group: false }` leaves it ungrouped. Every Throughline plugin that declares a collection takes the same option — see [the reference](https://github.com/forumone/throughline/blob/main/docs/reference/plugin-contract.md#admin-sidebar-group).

## Job failures and error reporting

The audit log records who did what through an MCP tool. A background job that
ran out of retries is not that, so it has its own collection:
`jobFailuresPlugin()` adds `job-failures` and attaches a writer that
`@forumone/throughline-workflows`' failure handlers find. Adding it to an
existing site is a schema change — run `payload migrate:create` afterwards.

Error reports go to a webhook, not to a vendor SDK: `reportError` posts JSON to
`ERROR_WEBHOOK_URL` (a log drain, an alerting endpoint, a Slack incoming
webhook, a proxy in front of a tracker), with a 3-second timeout, and never
throws. `buildRequestErrorReport` shapes what Next's `onRequestError` hands
over, copying request headers from an allowlist — `cookie` and `authorization`
are never copied.

```typescript
// instrumentation.ts
import type { Instrumentation } from 'next'
import { buildRequestErrorReport, reportError } from '@forumone/throughline-core/observability'

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportError(buildRequestErrorReport(error, request, context))
}
```

`./observability` imports neither Payload nor Inngest at runtime, so it is safe
in `instrumentation.ts`. See `docs/operations/observability.md`.

## MCP authentication

`@payloadcms/plugin-mcp` handles MCP authentication. It adds the `payload-mcp-api-keys` collection, looks up `Authorization: Bearer <key>` on `/api/mcp`, and runs each tool as the person the key is bound to. This package's `createApiKeysCollection`, `createBearerTokenAuthenticator` and `createMcpHandler` are gone.

What this package adds is two access helpers for a site that registers that plugin.

**Only admins should manage keys.** A key runs every tool as its user, so minting, reading and revoking keys is an admin's job. The plugin doesn't enforce that by default. `mcpApiKeyAccess(isAdmin)` is an `overrideApiKeyCollection` that applies your admin rule to `read`, `create`, `update`, `delete` and `unlock`, and refuses an MCP key principal before it asks the rule:

```ts
import { createMcpToolCollector, mcpApiKeyAccess } from '@forumone/throughline-core'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import type { Access } from 'payload'

const isAdmin: Access = ({ req: { user } }) =>
  user?.collection === 'users' && Array.isArray(user.roles) && user.roles.includes('admin')

mcpPlugin({
  mcp: { tools: mcpTools.tools },
  overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
})
```

It changes `access` and nothing else. To set other options too, call it inside your own override:

```ts
overrideApiKeyCollection: collection => {
  const hardened = mcpApiKeyAccess(isAdmin)(collection)
  return { ...hardened, admin: { ...hardened.admin, group: 'Throughline' } }
},
```

**"Signed in" is not `Boolean(req.user)`.** Before Payload 3.89.0, the key collection's `auth.useAPIKey` registered Payload's API-key strategy on every REST route, so a key _document_ could become `req.user`. It has no roles, but it passes `Boolean(req.user)`, so a rule like "published, or anybody signed in" served drafts to anyone holding a key. Payload 3.89.0 fixed this, and it's this package's peer floor. Refuse the principal in your own rules as well:

| Export                       | What it does                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `isSignedIn(user)`           | `true` for a person, `false` for anonymous or an MCP key document. A type guard |
| `signedIn`                   | `isSignedIn` as an `Access` function                                            |
| `isMcpApiKeyPrincipal(user)` | `true` only for a key document from `payload-mcp-api-keys`                      |
| `MCP_API_KEYS_SLUG`          | `'payload-mcp-api-keys'`                                                        |

None of these affects `/api/mcp`. A tool call there arrives as the key's user, in `users`, with that person's roles. See [the security model](../../docs/operations/security-model.md#signed-in-is-not-booleanrequser).

### Scopes

A key carries `scopes`, and a tool may declare the one it needs:

```ts
const publishTool: McpToolDefinition = {
  name: 'publish',
  requiredScope: 'publishing.execute',
  // …
}
```

> **Nothing enforces this today.** The paragraphs below describe how
> `requiredScope` behaved when each server mounted its own `/api/<server>/mcp`
> endpoint behind a hand-written JSON-RPC handler. That handler — and the
> `auth.ts` that held callers to their scopes — were removed by "one MCP
> transport, not seven" (#80), which consolidated every server onto Payload's
> `/api/mcp`. The scope declarations survived the refactor; the enforcement did
> not, and this section was not updated to say so. Audit 04 F-02.
>
> **What gates a tool now** is the per-key checkbox `@payloadcms/plugin-mcp`
> generates, one per tool name. Two consequences worth knowing before relying
> on either: all 27 of them **default to `true`**
> (`createApiKeysCollection.js:4-15`), and a checkbox list cannot express
> "writes off until granted, reads on" the way a scope can.
>
> The declarations are kept because they are the tool → scope mapping a
> scope-aware default would be built from — see the note on `requiredScope` in
> `@forumone/throughline-plugin-contract`, which states the same thing at the
> type. Reinstating enforcement means putting it on the surviving transport.

Historically, and as the intended design: a tool that declares no
`requiredScope` is callable by any authenticated key, which is the right
default for a read. A tool that declares one was **hidden from `tools/list`**
and refused on a direct call unless the key named that scope — hidden as well
as refused, because an agent shown a tool it will be turned away from will try
it, fail, and report the tool as broken when what is narrow is the key.

A key carrying no scopes at all passed nothing scoped. Absent was read as none,
not as everything.

The consequential tools in this suite and the scopes they require:

| Scope                  | Tools                                                           |
| ---------------------- | --------------------------------------------------------------- |
| `publishing.execute`   | `publish`, `unpublish`, `schedule_publish`, `rollback`          |
| `approvals.request`    | `request_approval`                                              |
| `approvals.decide`     | `respond_to_approval`                                           |
| `forms.manage`         | `create_form`, `update_form_fields`, `update_form_destinations` |
| `integrations.trigger` | `trigger_sync`, `test_integration`                              |

Everything else — the component tools, the audit queries, the read side of publishing and approvals — needs only a valid key.

## Events

`CoreEvents` enumerates the events the framework fires today. Server packages add their own via TypeScript module augmentation:

```ts
declare module '@forumone/throughline-core/events' {
  interface FrameworkEvents {
    'approval/decided': {
      data: { approvalId: string; decision: 'granted' | 'declined' }
    }
  }
}
```

After augmentation, `inngest.send({ name: 'approval/decided', data: { ... } })` is type-checked everywhere.

## Checking the environment

Each plugin that falls back to `process.env` exports what it needs as data — `approvalsEnv`, `emailEnv`, `formsEnv` — and checks the same entries at init. A site passes every list, plus its own variables, to `assertEnvironment` first thing in `payload.config.ts`:

```ts
import { assertEnvironment } from '@forumone/throughline-core'
import { approvalsEnv } from '@forumone/throughline-approvals'
import { emailEnv } from '@forumone/throughline-email'

assertEnvironment(
  approvalsEnv,
  emailEnv,
  { name: 'PAYLOAD_SECRET', minLength: 32, why: 'Signs Payload sessions.' },
  () => databaseConnectionString(),
)
```

It throws once, listing every missing or too-short value with the reason it is needed, under a first line that says `Configuration problem` — instead of each plugin failing on the first thing it finds, one deploy at a time, inside a `next build` stack trace. It never prints a value. A function argument is for a rule that is not "this name, this long": what it throws becomes a line in the report.

`checkEnvValue(requirement, value)` is the one-value check behind it, which a plugin uses for its own init backstop.

## Document content hashing

`documentContentHash(document)` reduces a Payload document to a hash of the part an editor authored, ignoring the metadata that moves without the content moving — `id`, `createdAt`, `updatedAt`, `_status`, `__v`, `_id`, `globalType`, stripped at every level of the document. Object key order does not affect the result, because blocks come back out of JSONB in no promised order; array order does, because that is the order of the blocks on the page.

```ts
import { documentContentHash } from '@forumone/throughline-core'

const version = await documentContentHash(page)
const withExtras = await documentContentHash(page, { exclude: ['syncedAt'] })
```

It exists so that approvals can bind to _what an approver read_ rather than to when it was last saved. Approvals writes it as `targetVersion`; publishing recomputes it at publish time. Two consequences worth stating: a save that changed nothing keeps a granted approval, and an edit that is reverted brings one back.

**Two callers only agree if they hash a document loaded the same way.** Both of the above use `payload.findByID({ collection, id, draft: true })` at the config's default depth. A populated relationship and a bare relationship id are different values, and normalising cannot turn one into the other — so a third caller fetching at a different depth would produce a hash that matches nothing.

## Running the Payload CLI: `throughline-payload`

`pnpm payload generate:types` is shell → pnpm → node, and pnpm (like npm and
yarn) does not forward signals to the node child it spawns. Kill the shell — a
Ctrl-C, an agent's tool-call timeout, a cancelled CI step — and node keeps
running, reparented to PID 1. When the run was hung rather than slow, it spins
on a core until something kills it; one machine collected 48 of them.

`throughline-payload` is a drop-in for the `payload` binary that cannot do that.
Point every script that runs the Payload CLI at it:

```json
{
  "scripts": {
    "payload": "throughline-payload",
    "payload:reap": "throughline-payload --reap",
    "generate:types": "throughline-payload generate:types",
    "generate:importmap": "throughline-payload generate:importmap",
    "migrate": "PAYLOAD_MIGRATING=1 throughline-payload migrate",
    "migrate:create": "throughline-payload migrate:create",
    "migrate:status": "throughline-payload migrate:status"
  }
}
```

Arguments pass straight through. What it adds:

- **Its own process group.** Payload runs `detached`, so the whole subtree can be
  killed as a group, by pid. Nothing is ever matched by process name.
- **Signals forwarded.** SIGINT, SIGTERM and SIGHUP go to the group; after a
  grace period, whatever ignored them gets SIGKILL. When Payload exits on its
  own, anything it left running in its group goes with it.
- **A wall clock.** `PAYLOAD_CLI_TIMEOUT_MS`, default 300000 (five minutes); `0`
  disables it. The `migrate` family (`migrate`, `migrate:create`, …) has no wall
  clock unless you set one: a large migration is legitimately long and
  `migrate:create` can stop at a prompt. A timed-out run exits 124.
  `PAYLOAD_CLI_GRACE_MS` (default 5000) is the wait between the polite signal
  and SIGKILL.
- **A sweep for what a killed runner left behind.** A SIGKILLed runner runs no
  handlers, so each run is recorded in `.payload-cli-pids` and the next run —
  or `throughline-payload --reap` — kills the group of any entry whose runner
  is gone. An entry is acted on only if the pid is alive, its start time and
  full command line still match what was recorded (so a recycled pid is never
  touched), the command line is rooted in this workspace, and its runner is
  gone (so a concurrent run keeps its child). Anything else is forgotten, not
  signalled.

Payload is resolved from the directory the command runs in — the app — not
from this package's install. `.payload-cli-pids` lives at the workspace root:
the nearest ancestor with a `pnpm-workspace.yaml`, or, outside a pnpm
workspace, the nearest directory with a `package.json`. Add it to
`.gitignore`. On Windows, which has neither process groups nor `ps`, the runner
just runs Payload.

## Why all of this lives in one package

Server packages (Component, Publishing, Approvals, Audit Query, Forms, Integrations) all depend on the same audit log, the same authentication pattern, and the same event taxonomy. Splitting these across packages would create circular dependencies — every server package would need the audit writer, and an audit-only package would need to know about every server. Consolidating the plumbing here keeps the dependency graph one-way: core → server packages → client app.
