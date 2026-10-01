# @forumone/throughline-plugin-contract

Shared type contracts every Throughline core plugin satisfies, plus the cross-plugin runtime registry. Core packages import from here so the plugin surface stays consistent across the framework. It is published because every core plugin imports `getPluginRegistry` from it at runtime.

## What's in here

- `CorePlugin<Options>` — the Payload plugin signature every core package exports
- `BaseCorePluginOptions` — options every plugin accepts (`enabled`, `logger`, and `routePrefix` for a plugin that serves HTTP endpoints of its own)
- `CollectionPluginOptions`, `PluginAdminOptions`, `DEFAULT_ADMIN_GROUP`, `resolveAdminGroup` — the `admin: { group }` option every plugin that declares a collection accepts, its `'Throughline'` default, and the helper that turns it into a collection's `admin.group` (see below)
- `McpToolDefinition`, `McpToolContext`, `McpMeta` — the MCP tool surface
- `AuthenticatedUser` — the actor a tool handler receives
- `EnvRequirement` — `{ name, minLength?, why }`: one environment variable a plugin cannot start without, as data. A plugin exports a list of them as `<plugin>Env` (`approvalsEnv`), and a site passes the lists to `assertEnvironment` from `@forumone/throughline-core`
- `getPluginRegistry` — the runtime registry plugins use to announce themselves and check for sibling plugins
- `examplePlugin` — a reference implementation showing the exact shape every future plugin follows

## Admin group for plugin-owned collections

A plugin that declares a collection extends `CollectionPluginOptions` and spreads `resolveAdminGroup(options.admin)` into each collection's `admin` block:

```ts
admin: { ...resolveAdminGroup(options.admin), useAsTitle: 'title' }
```

| `admin.group` | Result |
| --- | --- |
| omitted | the `'Throughline'` group (`DEFAULT_ADMIN_GROUP`) |
| `'Workflow'` (or `{ en: 'Workflow', fr: 'Flux' }`) | that group |
| `false` | ungrouped — Payload's default "Collections" section |

`false` here means *ungrouped*. On a collection's own `admin.group`, Payload reads `false` as "leave out of the nav entirely"; `resolveAdminGroup` never passes `false` through.

## Authoring a plugin

See `docs/building-plugins.md` at the repo root.
