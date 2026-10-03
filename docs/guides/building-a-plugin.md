# Building a core plugin

Every part of `@forumone/throughline` that extends Payload is a plugin on its own subpath — `/publishing`, `/approvals`, `/audit` — and follows the same pattern. This guide shows you how to add one to the package so it composes cleanly with the rest of the suite, and how `throughline()` comes to register it.

Read an existing one alongside: `src/approvals/` is a complete, small example.

## Where it lives

```
packages/throughline/src/my-feature/
├── index.ts                # the subpath's public surface: the plugin function + options type
├── plugin.ts               # the plugin function
├── options.ts              # Zod schema + inferred options type
├── collection.ts           # Payload collections the plugin injects
├── tools/                  # MCP tool descriptors and factories (if applicable)
├── jobs/                   # background jobs, with defineJob (if applicable)
└── endpoints/              # HTTP handlers of its own (if applicable)
```

Then:

- **Add the subpath** to `package.json`'s `exports`: `"./my-feature": { "types": "./dist/my-feature/index.d.ts", "default": "./dist/my-feature/index.js" }`.
- **Import siblings by their declaring module** (`../audit/plugin.js`), never through another subpath's `index.ts`.
- **An optional peer** the feature needs goes in `peerDependenciesMeta` as optional, is imported only from this subpath, and is listed in `src/peers.test.ts`, which fails a static import that would load it from anywhere else.
- **Regenerate the codemod's table** with `node scripts/migrate-table.mjs`: a test fails when `src/migrate/exports.json` is behind the package's exports.
- **Give `throughline()` a key for it**, below.

## The plugin function

```typescript
import type { CorePlugin } from '../plugin-contract/index.js'
import { getPluginRegistry } from '../plugin-contract/registry.js'
import type { MyPluginOptions } from './options.js'
import { validateOptions } from './options.js'

export const myPlugin: CorePlugin<MyPluginOptions> = (options) => (incomingConfig) => {
  if (options.enabled === false) return incomingConfig

  const validated = validateOptions(options) // throws on invalid input
  // Note: routePrefix MUST NOT include `/api`. Payload mounts top-level
  // endpoints under its API base (default `/api`), so the user-facing URL
  // becomes `/api/my-plugin/webhook`. Omit the option entirely if your plugin
  // serves no HTTP endpoints of its own — MCP is not one of them.
  const routePrefix = validated.routePrefix ?? '/my-plugin'

  /*
  Declared now, bound at `onInit`. `plugin-mcp` reads names and descriptions
  here, as the config is built, to generate one per-key checkbox per tool — and
  a tool with no checkbox is denied to every key, silently. Keep them in a
  `tools/descriptors.ts` the factories spread from, so the checkbox and the MCP
  client cannot describe a tool differently.
  */
  validated.mcpTools?.declare(MY_PLUGIN_TOOL_DESCRIPTORS, { serverName: 'my-plugin' })

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), myCollection],
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      // Your own HTTP surface, if you have one. Not MCP — see below.
      { path: `${routePrefix}/webhook`, method: 'post', handler: myWebhook },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      /*
      Handlers are built here, not at config time, because each closes over
      `payload`. They bind into the entries declared above, matched by name —
      so a tool built without a descriptor throws here rather than going quietly
      missing from every key.

      Do not serve MCP yourself. Every plugin in this suite used to mount its
      own `/<prefix>/mcp` on a hand-written JSON-RPC subset; they are deleted,
      and one endpoint for every server is the point.
      */
      validated.mcpTools?.add([myTool(payload)], { serverName: 'my-plugin' })

      getPluginRegistry(payload).register({
        id: '@forumone/throughline/my-feature',
        version: PLUGIN_VERSION,
        capabilities: ['my-capability'],
      })
    },
  }
}
```

Three structural rules that are non-negotiable:

- Honour `enabled === false` before doing any work.
- Never replace `incomingConfig.collections`, `endpoints`, or `hooks.*` arrays — always spread the existing value and append.
- Route prefixes for top-level endpoints MUST NOT include `/api`. Payload's API base (`config.routes.api`, default `/api`) is prepended automatically, so a `path: '/api/my-plugin/webhook'` registers at `/api/api/my-plugin/webhook`.
- Do not serve an MCP endpoint. Declare your tools as the config is built, bind their handlers at `onInit`, and let the host serve them on one `/api/mcp`.
- If your plugin declares a collection, accept `admin: { group }` and apply it to every collection you declare — see below.
- Your plugin must be registered before `mcpPlugin` in the host's array. That is a requirement, not a convention: declaring after it has read the array means no checkboxes, and no checkbox means the tool is denied to every key. `throughline()` meets it for you, because `suite.plugin` goes before `mcpPlugin`.

## Admin sidebar group

A plugin that declares a collection extends `CollectionPluginOptions` and spreads `resolveAdminGroup(options.admin)` into each collection's `admin` block. That gives every Throughline collection the same sidebar placement — the `Throughline` group by default, a host-chosen group, or ungrouped for `false` — and leaves the host no reason to reach into your collections from a late-running plugin.

```typescript
import type { BaseCorePluginOptions, CollectionPluginOptions } from '../plugin-contract/index.js'
import { resolveAdminGroup } from '../plugin-contract/admin.js'

export interface MyPluginOptions extends BaseCorePluginOptions, CollectionPluginOptions {
  // …
}

const myCollection: CollectionConfig = {
  slug: 'my-records',
  admin: { ...resolveAdminGroup(options.admin), useAsTitle: 'title' },
  fields: [/* … */],
}
```

Don't write `group: options.admin?.group` directly: Payload reads `admin.group: false` as "hide from the nav", and the option's `false` means "ungrouped". `resolveAdminGroup` does that translation. See [Admin sidebar group](../reference/throughline.md#admin-sidebar-group).

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

## Environment variables

If your plugin falls back to `process.env` for something it cannot start without — a secret, an API key — declare it as data, export the list next to the plugin, and drive your own init check from the same entries.

```typescript
// options.ts
import { checkEnvValue } from '../env/index.js'
import type { EnvRequirement } from '../plugin-contract/index.js'

const SIGNING_SECRET_ENV = {
  name: 'MY_PLUGIN_SIGNING_SECRET',
  minLength: 32,
  why: 'Signs my-plugin webhooks; myPlugin will not start without it. Generate with `openssl rand -base64 48`.',
} as const satisfies EnvRequirement

/** What myPlugin reads from the environment and refuses to start without. */
export const myPluginEnv: readonly EnvRequirement[] = [SIGNING_SECRET_ENV]

export function validateOptions(options: MyPluginOptions) {
  // …
  const secret = options.signingSecret ?? process.env[SIGNING_SECRET_ENV.name]
  if (secret === undefined || checkEnvValue(SIGNING_SECRET_ENV, secret)) {
    throw new Error(
      `myPlugin requires options.signingSecret or the ${SIGNING_SECRET_ENV.name} env var (${SIGNING_SECRET_ENV.minLength}+ characters).`,
    )
  }
}
```

```typescript
// index.ts
export { myPlugin } from './plugin.js'
export { myPluginEnv } from './options.js'
```

The conventions:

- **Name the list after the plugin**: `myPlugin` exports `myPluginEnv`, as `approvalsPlugin` exports `approvalsEnv`. That is how a site finds it.
- **Declare only what the plugin refuses to start without.** A variable with a sensible default, or one only read on first use, is not a requirement — the site decides whether its own deployment needs it.
- **Write `why` for the person fixing a deploy**: what the value is for and how to get one. It is printed beside the name. Never a value, or anything derived from one.
- **Keep the init check.** It is the backstop for a site that does not call `assertEnvironment`, and because it reads the same entry, the two cannot disagree.
- **Test that they agree.** With only the declared variables set and no options, `validateOptions` passes; with any one unset, or one character under its `minLength`, it throws. See `src/approvals/env.test.ts`.

A site then passes your list to `assertEnvironment` from `@forumone/throughline` at the top of its `payload.config.ts`, with every other plugin's and its own, and gets every missing variable reported in one error. See [Environment variables](../operations/environment-variables.md#checking-everything-at-startup).

## MCP tools

Plugins do not serve MCP. Each declares its tools into the `mcpTools` collector it is given and binds their handlers at `onInit`, as above, and the host serves every tool on one `/api/mcp` through `@payloadcms/plugin-mcp`. `throughline()` builds the collector and hands it to every plugin; `suite.mcpTools` is what the host passes to `mcpPlugin`.

## Cross-plugin dependencies

Plugins that need a sibling check the registry in `onInit`:

```typescript
onInit: async (payload) => {
  if (incomingConfig.onInit) await incomingConfig.onInit(payload)
  const registry = getPluginRegistry(payload)
  registry.requireCapability('audit-log', '@forumone/throughline/my-feature')
  registry.register({ id: '@forumone/throughline/my-feature', version, capabilities: ['my-feature'] })
}
```

A sibling's runtime surface — the audit writer, the publishing service — is reached through its accessor (`getAuditWriter(payload)`), not by calling the sibling's plugin. The registry is internal: it is how the suite's own plugins check each other, and a site never sees it.

## Registering it in `throughline()`

`src/throughline.ts` is where a plugin is switched on. Add a key to `ThroughlineOptions`, typed as your options less what the suite supplies (`Omit<MyPluginOptions, Supplied>`), and push your plugin where its dependencies are already registered:

```typescript
if (options.myFeature) {
  plugins.push(myFeaturePlugin({ ...options.myFeature, ...logger, ...adminFor(options.myFeature), mcpTools }))
}
```

If it has jobs, add them to `suiteJobs` under the same key. Then add the key to the options table in [the reference](../reference/throughline.md#throughline-options), and a case to `src/throughline.test.ts`, which builds the whole composition with every plugin on.

## Conventions

- ESM only, with the `.js` suffix on relative imports
- Never import from `apps/`, a site, or a design system: the platform does not know about the instance
- `payload` is the one required peer; anything else is optional, and loaded only by the subpath that needs it

## Testing

Every plugin ships with unit tests (Vitest) covering:

- Options validation — both happy path and meaningful error messages
- The environment declaration, against what the init check enforces (see above)
- Pure helper functions
- Tool handlers invoked through their contract (not via HTTP)

The `Scaffold` CI job then builds a generated site against the packed package, which is the check that the plugin composes with a real Payload.

## Publishing

A new plugin is a minor release of `@forumone/throughline`. Run `pnpm changeset`, pick `@forumone/throughline` (the other two packages follow it, at one version), and commit the generated `.changeset/*.md` file alongside your diff. The release workflow bumps versions and publishes to npm when its release PR merges.
