# Building a core plugin

Every package in `@forumone/throughline-*` that extends Payload follows the same pattern. This guide shows you how to add a new plugin package so it composes cleanly with the rest of the framework.

The canonical reference implementation lives in `packages/plugin-contract/src/example-plugin-pattern.ts`. When in doubt, copy from there.

## Package structure

```
packages/my-plugin/
├── src/
│   ├── index.ts                # Main export: the plugin function + options type
│   ├── options.ts              # Zod schema + inferred options type
│   ├── collections/            # Payload collections the plugin injects
│   ├── mcp/                    # MCP server implementation (if applicable)
│   │   ├── server.ts
│   │   ├── tools/
│   │   └── auth.ts
│   ├── hooks/                  # Payload hooks
│   └── endpoints/              # Next.js API route handlers
├── eslint.config.js            # re-exports @forumone/throughline-eslint-config
├── package.json
├── tsconfig.json               # extends @forumone/throughline-tsconfig/library.json
├── README.md
└── CHANGELOG.md                # managed by changesets
```

## The plugin function

```typescript
import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import type { MyPluginOptions } from './options.js'
import { validateOptions } from './options.js'

export const myPlugin: CorePlugin<MyPluginOptions> = (options) => (incomingConfig) => {
  if (options.enabled === false) return incomingConfig

  const validated = validateOptions(options) // throws on invalid input
  // Note: routePrefix MUST NOT include `/api`. Payload mounts top-level
  // endpoints under its API base (default `/api`), so the user-facing URL
  // becomes `/api/my-plugin/mcp`.
  const routePrefix = validated.routePrefix ?? '/my-plugin'

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), myCollection],
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      {
        path: `${routePrefix}/mcp`,
        method: 'post',
        handler: createMcpHandler(validated),
      },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)
      getPluginRegistry(payload).register({
        id: '@forumone/throughline-my-plugin',
        version: packageJson.version,
        capabilities: ['my-capability'],
      })
    },
  }
}
```

Three structural rules that are non-negotiable:

- Honour `enabled === false` before doing any work.
- Never replace `incomingConfig.collections`, `endpoints`, or `hooks.*` arrays — always spread the existing value and append.
- Route prefixes for top-level endpoints MUST NOT include `/api`. Payload's API base (`config.routes.api`, default `/api`) is prepended automatically, so a `path: '/api/my-plugin/mcp'` registers at `/api/api/my-plugin/mcp`.

## Options validation

Every plugin validates options at load time using a Zod schema. The inferred TypeScript type becomes the package's public options shape.

```typescript
import { z } from 'zod'

export const MyPluginOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  routePrefix: z.string().optional(),
  requiredOption: z.string(),
  // …
})

export type MyPluginOptions = z.infer<typeof MyPluginOptionsSchema>

export function validateOptions(options: MyPluginOptions): MyPluginOptions {
  const result = MyPluginOptionsSchema.safeParse(options)
  if (!result.success) {
    throw new Error(`Invalid options for my-plugin: ${result.error.message}`)
  }
  return result.data
}
```

Options types exported from `src/index.ts` should be the Zod-inferred type so client apps and the validator can never drift.

## MCP server endpoint

Core plugins expose MCP servers as Next.js endpoints registered through Payload's `endpoints` config. This means client apps get the MCP endpoint automatically when they install the plugin — no manual route wiring.

See `C5-component-server.md` and `C6-publishing-server.md` for complete reference implementations once those phases land.

## Cross-plugin dependencies

Plugins that need a sibling plugin check the registry in `onInit`:

```typescript
onInit: async (payload) => {
  if (incomingConfig.onInit) await incomingConfig.onInit(payload)
  const registry = getPluginRegistry(payload)
  registry.requireCapability('audit-log', '@forumone/throughline-publishing')
  registry.register({ id: '@forumone/throughline-publishing', version, capabilities: ['publishing'] })
}
```

Never import another core plugin package directly — go through the registry.

## `package.json` conventions

- `"type": "module"` — ESM only
- Declare exports via the `exports` field, not `main`/`module`/`types` individually
- Depend on `@forumone/throughline-plugin-contract` as a workspace dependency
- Peer-depend on `payload` with a caret range matching the supported major
- Never depend on other core plugin packages directly; use the registry

## Testing

Every plugin ships with unit tests (Vitest) covering:

- Options validation — both happy path and meaningful error messages
- Pure helper functions
- Tool handlers invoked through their contract (not via HTTP)

Integration tests (Playwright against `apps/playground`) verify the plugin composes correctly with Payload.

## Publishing

Plugins publish on the repo's standard changesets flow. After making a change, run `pnpm changeset`, pick the affected packages, and commit the generated `.changeset/*.md` file alongside your diff. The release workflow bumps versions and publishes to npm on merge to `main`.
