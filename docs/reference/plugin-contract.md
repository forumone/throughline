# @forumone/throughline-plugin-contract

Shared types for building Throughline-compatible plugins. This is what you depend on when writing your own plugin or when implementing an `Integration`. The package is private (not published) — Throughline plugins consume it via workspace dependency.

> [!NOTE]
> Most consumers don't import from this package directly. The common types are re-exported from `@forumone/throughline-core`. Import from here only when you're publishing a plugin against Throughline's contracts.

## Install

```json
{
  "dependencies": {
    "@forumone/throughline-plugin-contract": "workspace:*"
  }
}
```

(In a Throughline core PR, this is a workspace path. In a separately-published plugin, you can copy the types into your package — they're stable and small.)

## Public API

```typescript
import type {
  AuthenticatedUser,
  BaseCorePluginOptions,
  CollectionPluginOptions,
  CorePlugin,
  Logger,
  McpAuthResult,
  McpAuthenticator,
  McpToolContext,
  McpToolDefinition,
  PluginAdminGroup,
  PluginAdminOptions,
  PluginRegistry,
  PluginRegistryEntry,
} from '@forumone/throughline-plugin-contract'

import { DEFAULT_ADMIN_GROUP, resolveAdminGroup } from '@forumone/throughline-plugin-contract'
```

### `CorePlugin<Options>`

```typescript
type CorePlugin<Options> = (options: Options) => Plugin
```

A function that takes options and returns a Payload `Plugin`. Every Throughline plugin's main export has this signature.

### `BaseCorePluginOptions`

```typescript
interface BaseCorePluginOptions {
  enabled?: boolean
  routePrefix?: string
}
```

Common option shape every Throughline plugin extends. Always honour `enabled === false` (return the incoming config unchanged) and never include `/api` in `routePrefix` (Payload prepends it).

`routePrefix` covers a plugin's own HTTP endpoints — admin controls, an approval action link, a public form post. It does not cover MCP: tools reach a client through the host's `@payloadcms/plugin-mcp`, on one `/api/mcp`. A plugin that serves no HTTP endpoints of its own should `Omit` this option rather than accept one it cannot honour — `auditQueryPlugin`, `componentsPlugin` and `integrationsPlugin` all do.

### Admin sidebar group

```typescript
type PluginAdminGroup = string | Record<string, string> | false

interface PluginAdminOptions {
  group?: PluginAdminGroup          // default DEFAULT_ADMIN_GROUP ('Throughline')
}

interface CollectionPluginOptions {
  admin?: PluginAdminOptions
}

function resolveAdminGroup(admin?: PluginAdminOptions): { group?: string | Record<string, string> }
```

Every plugin that declares a collection extends `CollectionPluginOptions`: `auditPlugin` (`audit-events`), `approvalsPlugin` (`approvals`), `integrationsPlugin` (`integrations`) and `formsPlugin` (`forms`, `form-submissions`). One `admin.group` applies to every collection that plugin declares.

| `admin.group` | Sidebar placement |
| --- | --- |
| omitted | the `Throughline` group |
| a string, or a locale map such as `{ en: 'Workflow', fr: 'Flux' }` | that group |
| `false` | ungrouped — Payload's default "Collections" section |

The default is a group because Payload renders an ungrouped collection loose at the top of the sidebar, above every group, so the audit log and approval queue would otherwise sit above the content editors came to edit.

`false` means *ungrouped* here. On a collection's own `admin.group`, Payload reads `false` as "leave out of the nav entirely"; `resolveAdminGroup` returns `{}` for it and never passes `false` through. A plugin author spreads its result into each collection's `admin` block — see [Building a plugin](../guides/building-a-plugin.md).

```typescript
auditPlugin({ inngest, admin: { group: 'Workflow' } })
approvalsPlugin({ /* … */ admin: { group: 'Workflow' } })
integrationsPlugin({ inngest, mcpTools, admin: { group: 'Admin' } })
```

#### `@payloadcms/plugin-mcp`'s key collection

`payload-mcp-api-keys` comes from Payload's plugin, which takes no group option and so lands ungrouped. Group it through the plugin's `overrideApiKeyCollection`, keeping whatever else that override already does:

```typescript
mcpPlugin({
  mcp: { tools: mcpTools.tools },
  overrideApiKeyCollection: (collection) => ({
    ...collection,
    admin: { ...collection.admin, group: DEFAULT_ADMIN_GROUP },
    // access: { … } — the scaffold narrows this collection to admins here
  }),
})
```

### `PluginRegistry`

```typescript
interface PluginRegistry {
  register(entry: PluginRegistryEntry): void
  has(capability: string): boolean
  requireCapability(capability: string, callerId: string): void
  list(): PluginRegistryEntry[]
}

interface PluginRegistryEntry {
  id: string
  version: string
  capabilities: string[]
}
```

Plugins register themselves and what they provide; sibling plugins call `requireCapability` to assert a dependency. See [Plugin composition](../concepts/plugin-composition.md).

### `AuthenticatedUser`

```typescript
interface AuthenticatedUser {
  id: string
  email?: string
  roles?: string[]
  groups?: string[]
}
```

The shape MCP tool handlers receive after Bearer-token auth resolves. The `roles` and `groups` fields drive role-gated tool access.

`McpAuthenticator` and `McpAuthResult` used to live here, describing "validate this MCP request and return a user". Authentication is `@payloadcms/plugin-mcp`'s now — it does the key lookup and hands the tool its user — so both types are gone rather than kept as a shape nothing implements.

### `McpToolDefinition`

```typescript
interface McpToolDefinition<Input = unknown, Output = unknown> {
  name: string
  description: string
  inputSchema: ZodSchema<Input>
  // Which tools are consequential, e.g. 'publishing.execute'. Read by nothing:
  // gating is the per-key checkbox plugin-mcp generates per tool.
  requiredScope?: string
  handler: (input: Input, ctx: McpToolContext) => Promise<Output>
}
```

What an MCP tool looks like. Throughline plugins build arrays of these at `onInit` and hand them to the collector the host passed in — `createMcpToolCollector` in `@forumone/throughline-core` — whose array the host has already given to `@payloadcms/plugin-mcp`.

### `McpToolContext`

```typescript
interface McpToolContext {
  user: AuthenticatedUser
  payload: Payload
  logger: Logger
  // The Inngest client, if the plugin received one
  inngest?: InngestClient
}
```

What a tool handler receives alongside its validated input.

### `Logger`

```typescript
interface Logger {
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  debug?(message: string, fields?: Record<string, unknown>): void
}
```

The minimal logger interface. Throughline core ships one (`defaultLogger`) but any logger satisfying this shape works.

### `EnvRequirement`

```typescript
interface EnvRequirement {
  readonly name: string        // e.g. 'APPROVAL_TOKEN_SECRET'
  readonly minLength?: number  // for secrets, where short is as bad as missing
  readonly why: string         // what it is for and how to get one; printed beside the name
}
```

One environment variable a plugin refuses to start without, as data. A plugin that reads `process.env` at init exports its list next to its factory, named for it — `approvalsPlugin` / `approvalsEnv` — and checks the same entries at init with `checkEnvValue` from core. A site hands the lists to `assertEnvironment` (see [core](core.md#environment)), which reports every problem at once. The list describes the environment *fallback*: a site that passes the value as an option leaves that list out.

## Patterns

The `src/example-plugin-pattern.ts` file in this package shows a worked plugin example using only contract types. When in doubt, copy from there.

## Related

- Guide: [Building a plugin](../guides/building-a-plugin.md) — start-to-finish tutorial
- Concept: [Plugin composition](../concepts/plugin-composition.md) — how the registry and capabilities work
