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
  CorePlugin,
  Logger,
  McpAuthResult,
  McpAuthenticator,
  McpToolContext,
  McpToolDefinition,
  PluginRegistry,
  PluginRegistryEntry,
} from '@forumone/throughline-plugin-contract'
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

## Patterns

The `src/example-plugin-pattern.ts` file in this package shows a worked plugin example using only contract types. When in doubt, copy from there.

## Related

- Guide: [Building a plugin](../guides/building-a-plugin.md) — start-to-finish tutorial
- Concept: [Plugin composition](../concepts/plugin-composition.md) — how the registry and capabilities work
