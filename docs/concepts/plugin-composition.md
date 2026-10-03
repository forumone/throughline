# Plugin composition

Every part of Throughline is a Payload plugin: a function `(config) => config` that adds collections, fields, hooks, endpoints, and onInit handlers. `throughline()` composes them: it registers each one the site's options ask for, in the order they depend on, and hands every one the same MCP collector and jobs adapter.

## Why plugins, not a monolithic SDK

The framework needs to compose with whatever else a Payload project is doing — custom collections, third-party Payload plugins, the host's own access controls. A monolithic SDK that took over the Payload instance at runtime would force ordering and conflict with that. Plugins compose by default: `suite.plugin` is one more entry in the host's `plugins` array, and everything it adds is ordinary Payload config.

Plugins also let a site pick up only what it needs. A plugin is on when its key is in `throughline()`'s options, and each is still exported from its own subpath for a site that wires one by hand.

## The order, and who owns it

`throughline()` registers, in this order:

1. **audit** — always; every other plugin writes to the audit log
2. **job failures** — always; where a job that ran out of retries is recorded
3. **components** — composition validation; publishing depends on it
4. **publishing** — the pipeline; reads the components validator and the approvals resolver
5. **approvals** — depends on audit; attaches the resolver publishing reads
6. **audit queries** — read-only tools over the audit log
7. **email** — sends the approval notifications
8. **integrations** — subscribes to events from the others
9. **references**, **fields** (always) and **editorial**

In 0.x a site listed the plugins itself and had to get this order right. In 1.0 the order is `throughline()`'s, and a site cannot get it wrong. Its reasoning is in [`1.0-throughline-call.md`](../spec/1.0-throughline-call.md).

## The capability registry

Plugins still assert their dependencies at boot. Each registers what it provides on a small registry on the Payload instance — audit registers `audit-log`, components registers `composition-validator` — and a plugin that needs one calls `requireCapability`, which throws during init if it isn't there. A missing prerequisite fails the boot with a message naming both plugins, rather than breaking at runtime.

The registry is internal from 1.0. `throughline()` registers plugins in an order that satisfies it, so a site never meets it unless it registers a plugin by hand, out of order.

## Symbol-based cross-plugin communication

Some plugins expose a richer surface than a capability: approvals attaches the resolver publishing reads, email its client, integrations its registry, audit its writer. Each is a **`Symbol.for(...)`** key on the Payload instance, such as `Symbol.for('@forumone/throughline/audit-writer')`, read through a small accessor (`getAuditWriter(payload)`) so a consumer never names the symbol. `Symbol.for` returns the same symbol from any copy of the module, so two plugins built separately still meet.

What the accessors used to give a site — the email jobs, the integration registry — `throughline()` now collects into `suite.jobs` and `suite.mcpTools`, so most of them are internal. `getAuditWriter`, `getJobFailureWriter` and `getPublishingService` remain public, for a site's own code.

## Naming conventions

- Plugin function: `<feature>Plugin` (camelCase) — `publishingPlugin`
- Options type: `<Feature>PluginOptions` (PascalCase) — `PublishingPluginOptions`
- Subpath: `@forumone/throughline/<feature>`, exporting both
- Capability name: short kebab-case slug — `audit-log`, `composition-validator`
- Symbol key: `Symbol.for('@forumone/throughline/<accessor>')`

## What a Throughline plugin looks like

```typescript
import type { CorePlugin } from '@forumone/throughline'

export const examplePlugin: CorePlugin<ExamplePluginOptions> = (options) => (incoming) => {
  if (options.enabled === false) return incoming
  return {
    ...incoming,
    collections: [...(incoming.collections ?? []), createExampleCollection(options)],
    onInit: async (payload) => {
      await incoming.onInit?.(payload)
      // attach a runtime API on the payload instance via Symbol.for,
      // add MCP tools to options.mcpTools, and so on
    },
  }
}
```

The plugin returns a *new* config — never mutates the incoming one in place — and always invokes the upstream `onInit` so chained plugins all get notified.

## Where plugin collections appear in the admin

`throughline()`'s `admin: { group }` applies to every collection the suite adds, and each plugin that declares one — audit, approvals, integrations — also takes its own, which wins. With neither they land in one `Throughline` sidebar group, so a fresh site's sidebar leads with its own content rather than the audit log. Pass a group name to file them elsewhere, or `false` to leave them ungrouped.

`@payloadcms/plugin-mcp`'s `payload-mcp-api-keys` is Payload's collection, not ours; group it through that plugin's `overrideApiKeyCollection`. See [Admin sidebar group](../reference/throughline.md#admin-sidebar-group).

## What plugins should not do

- **Mutate other plugins' collections.** If you need a collection to behave differently, your plugin owns its own collection or contributes fields to a shared one through a documented hook.
- **Read state from each other directly.** Either expose a capability + getter (cross-plugin API) or fire an event (loose coupling).
- **Patch Payload internals.** If a feature requires modifying Payload itself, it belongs in core.

## Testing composition

Each plugin ships with tests that build a fake Payload config, run the plugin's mutation, and assert the resulting config has the expected collections, endpoints, and onInit behavior. The fakes are deliberately minimal — they expose just enough surface for plugin tests to work without spinning up a real database. `src/throughline.test.ts` builds the whole composition with every plugin on, so an order the registry refuses fails it.

## Where to look in code

- `packages/throughline/src/throughline.ts` — the order, and what each plugin is given
- `packages/throughline/src/plugin-contract/registry.ts` — the capability registry
- `packages/throughline/src/<feature>/plugin.ts` — each entry function
