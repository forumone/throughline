# Phase C1 — Plugin Architecture

## Goal

Define the contract every core package satisfies when consumed by a client app: the Payload plugin shape, the MCP server mounting pattern, the composition model, and the shared options contract. After this phase, every subsequent core package follows a predictable pattern, and client apps know exactly what "consuming core" looks like.

## Prerequisites

- C0 complete; monorepo and publishing pipeline are operational

## Context

This is the most important architectural phase in the core track. Every decision here propagates through every future package. The wrong shape here means every subsequent phase has to work around it.

The core insight: Payload itself is a plugin-friendly framework. A Payload plugin takes a config object and returns a modified config object. Our core packages are Payload plugins in exactly this shape. A client app's `payload.config.ts` composes them:

```typescript
import { buildConfig } from 'payload'
import { publishingPlugin } from '@forumone/claude-cms-publishing'
import { approvalsPlugin } from '@forumone/claude-cms-approvals'
import { auditPlugin } from '@forumone/claude-cms-audit'

export default buildConfig({
  // client's collections, globals, database, etc.
  plugins: [
    auditPlugin({ /* client-specific options */ }),
    publishingPlugin({ /* client-specific options */ }),
    approvalsPlugin({ /* client-specific options */ }),
  ],
})
```

Each plugin injects its collections, hooks, API endpoints, admin views, and MCP tool registrations. The client app provides the content model, the design system reference, the brand config, and anything else that's genuinely per-client.

The MCP servers are the same pattern extended. Payload's MCP plugin handles tool exposure for its own operations; our custom servers (Publishing, Approvals, etc.) expose themselves as Next.js route handlers that the Payload plugin auto-registers. Client apps don't have to wire routes manually.

A few design principles for this phase:

- **Config over code.** Every per-client decision is a config option, never a code change. If a client needs to override behavior, they configure it; they don't fork the package.
- **Type safety across the boundary.** TypeScript types flow from core into client apps. When a client configures a plugin, the IDE tells them what options are valid.
- **No side effects at import.** Importing a core package must not start any servers, open any database connections, or register any global state. All wiring happens when the plugin function is called.
- **Predictable naming.** Every plugin exports a function named `<feature>Plugin`. Every package exports from its main entry point. Every option object is named `<Feature>PluginOptions`.

## Tasks

### C1.1 — Define the Payload plugin contract

Create `packages/plugin-contract/` as a new internal package (not published, shared types only).

`packages/plugin-contract/package.json`:

```json
{
  "name": "@forumone/claude-cms-plugin-contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "payload": "^3.0.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

This package defines shared types that other core packages import. It doesn't ship to npm; it's a workspace-internal type contract.

`packages/plugin-contract/src/index.ts`:

```typescript
import type { Config, Plugin } from 'payload'

/**
 * The base options every core plugin accepts. Plugin-specific options
 * extend this.
 */
export interface BaseCorePluginOptions {
  /**
   * Enable or disable the plugin without uninstalling. Defaults to true.
   */
  enabled?: boolean

  /**
   * The route prefix under which this plugin mounts its MCP server and
   * API endpoints. Defaults to a plugin-specific value like '/api/publishing'.
   * Override if you need to avoid collisions or expose under a different path.
   */
  routePrefix?: string

  /**
   * A logger the plugin will use for diagnostics. If not provided, a
   * default logger using console is used.
   */
  logger?: Logger
}

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
}

/**
 * A Payload plugin in the core framework signature. Plugins take their
 * options, return a function that takes a Payload config, and return a
 * modified config.
 */
export type CorePlugin<Options extends BaseCorePluginOptions = BaseCorePluginOptions> = (
  options: Options,
) => Plugin
```

This is deliberately small. Every plugin-specific options object extends `BaseCorePluginOptions`; every plugin function returns a standard Payload `Plugin`. The contract is enforced by TypeScript.

### C1.2 — Define the MCP server mounting contract

Create `packages/plugin-contract/src/mcp.ts`:

```typescript
import type { z } from 'zod'

/**
 * A single tool exposed by a core MCP server.
 */
export interface McpToolDefinition<Input extends z.ZodType = z.ZodType, Output = unknown> {
  /** The tool's name as exposed to the MCP client. */
  name: string
  /** Human-readable description used by the MCP client to decide when to call this tool. */
  description: string
  /** Zod schema for the input; used for validation and for generating the MCP tool schema. */
  inputSchema: Input
  /** The handler function. Receives validated input plus request context. */
  handler: (input: z.infer<Input>, context: McpToolContext) => Promise<Output>
}

export interface McpToolContext {
  /** The user identified by the API key used for this request. */
  user: AuthenticatedUser | null
  /** The API key's name, for audit logging. */
  apiKeyName: string
  /** The session ID from the MCP client, if provided. */
  sessionId?: string
  /** A request-scoped logger. */
  logger: Logger
}

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  roles: string[]
  groups: string[]
}

/**
 * Optional _meta parameters that clients may pass with consequential tool calls.
 * Used by the audit system to capture prompt and reasoning context.
 */
export interface McpMeta {
  userPrompt?: string
  reasoning?: string
  changesSummary?: string
}
```

And export from index:

```typescript
export * from './mcp'
```

### C1.3 — Establish the authentication pattern

Core packages that expose MCP servers share an authentication approach: bearer-token with the token mapped to a Payload user record.

Add `packages/plugin-contract/src/auth.ts`:

```typescript
import type { PayloadRequest } from 'payload'

/**
 * Authenticates an MCP request. Plugins use this to resolve the user
 * identity from an incoming request.
 */
export interface McpAuthenticator {
  /**
   * Validates the bearer token in the request's Authorization header.
   * Returns the authenticated user context or null if invalid.
   */
  authenticate(request: Request): Promise<McpAuthResult | null>
}

export interface McpAuthResult {
  user: AuthenticatedUser
  apiKeyName: string
  apiKeyId: string
}
```

Plugins accept an optional `authenticator` option; if not provided, a default is used that validates against Payload's user collection with a bearer-token scheme.

### C1.4 — Build the plugin example as a pattern

Add a complete, runnable example plugin in the package's docs that every future plugin follows. This is not a real feature; it's the reference implementation.

`packages/plugin-contract/src/example-plugin-pattern.ts`:

```typescript
import type { Plugin, Config } from 'payload'
import type { CorePlugin, BaseCorePluginOptions } from './index'

/**
 * EXAMPLE ONLY — not a real plugin. Reference implementation showing the
 * shape every core plugin follows.
 */

export interface ExamplePluginOptions extends BaseCorePluginOptions {
  /** A plugin-specific option. */
  greeting?: string
}

export const examplePlugin: CorePlugin<ExamplePluginOptions> = (options) => {
  return (incomingConfig: Config): Config => {
    // Step 1: Handle disabled state.
    if (options.enabled === false) return incomingConfig

    // Step 2: Apply defaults.
    const greeting = options.greeting ?? 'Hello'
    const routePrefix = options.routePrefix ?? '/api/example'

    // Step 3: Extend the config.
    return {
      ...incomingConfig,
      collections: [
        ...(incomingConfig.collections ?? []),
        // Plugin's own collections injected here
      ],
      hooks: {
        ...(incomingConfig.hooks ?? {}),
        afterChange: [
          ...(incomingConfig.hooks?.afterChange ?? []),
          // Plugin's hooks
        ],
      },
      endpoints: [
        ...(incomingConfig.endpoints ?? []),
        {
          path: `${routePrefix}/mcp`,
          method: 'post',
          handler: async (req) => {
            // MCP handler; delegates to the plugin's MCP server implementation
            return new Response(JSON.stringify({ greeting }))
          },
        },
      ],
      onInit: async (payload) => {
        // Preserve the existing onInit, then add our own.
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }
        // Plugin initialization (e.g., validate config, warm caches)
      },
    }
  }
}
```

This is the literal pattern every future package follows. Future phases should reference this example explicitly.

### C1.5 — Document plugin composition

Write `docs/plugin-composition.md` at the repo root (not inside any package — it's project-wide guidance):

```markdown
# How core plugins compose

Client apps compose core plugins by listing them in their Payload config's
`plugins` array. Order matters in some cases.

## Recommended order

Always load in this order:

1. `auditPlugin` — first, because it provides hooks other plugins use.
2. `componentsPlugin` — next, because Publishing depends on composition validation.
3. `publishingPlugin`
4. `approvalsPlugin`
5. `formsPlugin`
6. `integrationsPlugin` — last, because it subscribes to events from others.

Plugins that depend on another plugin check for its presence at load time
and fail loudly if a dependency is missing. They do not try to work around
missing dependencies silently.

## Options naming

- Plugin export: `<feature>Plugin` (camelCase)
- Options type: `<Feature>PluginOptions` (PascalCase)
- Package main: re-exports both

## Type imports

Client apps import options types to build well-typed configuration:

```typescript
import type { PublishingPluginOptions } from '@forumone/claude-cms-publishing'

const publishingConfig: PublishingPluginOptions = {
  // IDE autocompletes every option
}
```

## Configuration validation

Plugins validate their options at load time using Zod schemas. Invalid
configuration throws immediately with a clear error message. This prevents
runtime failures from misconfiguration.

## Environment variables

Plugins follow these naming conventions for env vars:

- `<FEATURE>_SERVER_API_KEY` — bearer token for this plugin's MCP server
- `<FEATURE>_TOKEN_SECRET` — signing secret for plugin-specific tokens (e.g. approval action tokens)

Plugins document their required env vars in their README.
```

### C1.6 — Define the plugin registry (informational)

Some plugins need to discover other plugins (e.g., Publishing needs to check if Approvals is loaded). Add a lightweight registry pattern.

`packages/plugin-contract/src/registry.ts`:

```typescript
/**
 * A lightweight registry plugins use to announce their presence and
 * discover sibling plugins. Lives on the Payload instance via a symbol
 * so it doesn't pollute the public API.
 */

const REGISTRY_SYMBOL = Symbol.for('@forumone/claude-cms/plugin-registry')

export interface PluginRegistryEntry {
  id: string
  version: string
  capabilities: string[]
}

export interface PluginRegistry {
  register(entry: PluginRegistryEntry): void
  has(id: string): boolean
  get(id: string): PluginRegistryEntry | undefined
  list(): PluginRegistryEntry[]
  requireCapability(capability: string, requiredBy: string): void
}

export function getPluginRegistry(target: object): PluginRegistry {
  const existing = (target as Record<symbol, PluginRegistry>)[REGISTRY_SYMBOL]
  if (existing) return existing

  const registry = createRegistry()
  Object.defineProperty(target, REGISTRY_SYMBOL, {
    value: registry,
    enumerable: false,
    writable: false,
  })
  return registry
}

function createRegistry(): PluginRegistry {
  const entries = new Map<string, PluginRegistryEntry>()

  return {
    register(entry) {
      if (entries.has(entry.id)) {
        throw new Error(`Plugin ${entry.id} is already registered`)
      }
      entries.set(entry.id, entry)
    },
    has(id) {
      return entries.has(id)
    },
    get(id) {
      return entries.get(id)
    },
    list() {
      return Array.from(entries.values())
    },
    requireCapability(capability, requiredBy) {
      const providers = Array.from(entries.values()).filter((entry) =>
        entry.capabilities.includes(capability),
      )
      if (providers.length === 0) {
        throw new Error(
          `Plugin ${requiredBy} requires capability "${capability}", but no registered plugin provides it.`,
        )
      }
    },
  }
}
```

Usage in a plugin:

```typescript
onInit: async (payload) => {
  const registry = getPluginRegistry(payload)
  registry.register({
    id: '@forumone/claude-cms-publishing',
    version: '0.1.0',
    capabilities: ['publishing', 'publish-pipeline'],
  })
  // Publishing requires audit to be registered
  registry.requireCapability('audit-log', '@forumone/claude-cms-publishing')
}
```

### C1.7 — Set up the internal playground app

Create `apps/playground/` as an internal Next.js + Payload app that consumes core packages for testing. This is never published; it's the dev loop for core work.

`apps/playground/package.json`:

```json
{
  "name": "@forumone/claude-cms-playground",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "payload": "payload"
  },
  "dependencies": {
    "next": "^15.0.0",
    "payload": "^3.0.0",
    "@payloadcms/db-postgres": "^3.0.0",
    "@payloadcms/plugin-mcp": "latest",
    "@payloadcms/storage-vercel-blob": "^3.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-plugin-contract": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

Scaffold it with `pnpm create payload-app` in a temp directory, then move the relevant files in. Reshape to match the monorepo conventions.

The playground does NOT need to be production-ready. It needs to run locally, connect to a local Postgres, and let us test core plugins as we build them. Set it up once, iterate.

`apps/playground/.env.example`:

```
DATABASE_URI=postgres://localhost:5432/claude_cms_playground
PAYLOAD_SECRET=dev-secret-change-me
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

Add a README explaining how to use the playground: run Postgres locally (Docker or native), set env vars, `pnpm dev` from the playground directory, connect Claude to the local MCP endpoint for testing.

### C1.8 — Add the first real smoke-test of the pattern

In the playground, import the example plugin pattern from `@forumone/claude-cms-plugin-contract` and verify it compiles and runs. This is the real smoke test — if the example pattern from C1.4 doesn't actually work when imported into a Payload config, the contract is wrong.

If the smoke test fails, iterate on the contract until it works. Only proceed past this task when the pattern is demonstrably functional.

### C1.9 — Write the "how to build a plugin" authoring guide

Create `docs/building-plugins.md`:

```markdown
# Building a core plugin

Every package in `@forumone/claude-cms-*` follows the same pattern. This guide shows you how to add a new plugin package.

## Package structure

```
packages/my-plugin/
├── src/
│   ├── index.ts                # Main export; the plugin function
│   ├── options.ts              # Options type + Zod validator
│   ├── collections/            # Payload collections the plugin injects
│   ├── mcp/                    # MCP server implementation (if applicable)
│   │   ├── server.ts
│   │   ├── tools/
│   │   └── auth.ts
│   ├── hooks/                  # Payload hooks
│   └── endpoints/              # Next.js API route handlers
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

## The plugin function

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import type { MyPluginOptions } from './options'

export const myPlugin: CorePlugin<MyPluginOptions> = (options) => (incomingConfig) => {
  if (options.enabled === false) return incomingConfig

  const validated = validateOptions(options)  // throws on invalid config
  const routePrefix = validated.routePrefix ?? '/api/my-plugin'

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), myCollection],
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      { path: `${routePrefix}/mcp`, method: 'post', handler: createMcpHandler(validated) },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)
      getPluginRegistry(payload).register({
        id: '@forumone/claude-cms-my-plugin',
        version: packageJson.version,
        capabilities: ['my-capability'],
      })
    },
  }
}
```

## Options validation

Every plugin validates options at load time.

```typescript
import { z } from 'zod'

export const MyPluginOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  routePrefix: z.string().optional(),
  requiredOption: z.string(),
  // ...
})

export type MyPluginOptions = z.infer<typeof MyPluginOptionsSchema>

export function validateOptions(options: MyPluginOptions) {
  const result = MyPluginOptionsSchema.safeParse(options)
  if (!result.success) {
    throw new Error(`Invalid options for my-plugin: ${result.error.message}`)
  }
  return result.data
}
```

## MCP server endpoint

Core plugins expose MCP servers as Next.js endpoints registered via Payload's endpoint config. This means client apps get the MCP endpoint automatically when they install the plugin — no manual route wiring.

See the Component Server (C5), Publishing Server (C6), etc. for complete reference implementations.

## Package.json conventions

- `"type": "module"` — ESM only
- `"exports"` — use the exports field, not `main`
- Depend on `@forumone/claude-cms-plugin-contract` as a workspace dependency
- Peer-depend on `payload` with a caret range
- Never depend on other core plugin packages directly; use the registry to discover them

## Testing

Every plugin has unit tests (Vitest) for its options validation, pure functions, and tool handlers. Integration tests (Playwright against the playground app) verify the plugin works when composed with Payload.
```

### C1.10 — Capture the first changeset

Since plugin-contract is private, it doesn't need a changeset for publishing. But the authoring guides and example pattern are valuable — commit them with clear commit messages.

Run `pnpm build` and `pnpm typecheck` from the root to verify everything still passes.

## Acceptance criteria

- [ ] `@forumone/claude-cms-plugin-contract` package exists as a private workspace package
- [ ] `CorePlugin`, `BaseCorePluginOptions`, `McpToolDefinition`, `McpToolContext` types are defined and exported
- [ ] Example plugin pattern (`example-plugin-pattern.ts`) compiles and shows every required step
- [ ] Plugin registry with `register`, `has`, `get`, `list`, `requireCapability` works as documented
- [ ] `apps/playground/` exists with Next.js + Payload, runs locally, connects to Postgres
- [ ] The example plugin pattern from the contract package can be imported into the playground and the app still builds
- [ ] `docs/plugin-composition.md` documents ordering, naming, type imports
- [ ] `docs/building-plugins.md` is a complete authoring guide for future phases to reference
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm lint` all pass

## Notes for Claude Code

- This phase has no published output. Nothing lands on npm. Don't add a changeset for `@forumone/claude-cms-plugin-contract` — it's private.
- The most important artifact is `docs/building-plugins.md`. Every future phase will reference it. If the guide is incomplete or inaccurate, future phases produce inconsistent packages.
- The playground app (C1.7) is the most time-consuming part of this phase. You don't need it to be beautiful. You need it to import core packages and run Payload. Skip any visual polish — that's the reference DS's job (C3), not the playground's.
- When writing the example plugin pattern (C1.4), resist the urge to make it do something useful. It's literally an example — keeping it useless keeps the focus on the plugin structure rather than the plugin's content.
- The plugin registry (C1.6) is the one piece that's easy to over-engineer. Resist that urge. Plugins don't need complex discovery; they need "is X present?" and "fail if X is missing." The three methods are enough.
- If Payload's plugin API has changed since this spec was written, follow the current Payload docs. The pattern (function that takes options, returns function that takes config, returns config) is stable; the exact Config shape may evolve.
- Commit after each significant task. C1.4 (example pattern), C1.6 (registry), and C1.7 (playground) are the three largest checkpoints.

## What's next

Phase C2 builds the design contract package — the Zod schema every design system satisfies, the manifest format, the loader, and the CI lint rules. It's a small package but it's the north star for the reference DS (C3) and the Component Server (C5). Get this right and the rest of the design system story flows naturally.
