# @forumone/throughline-plugin-contract

Shared type contracts every Throughline core plugin satisfies, plus the cross-plugin runtime registry. Core packages import from here so the plugin surface stays consistent across the framework. It is published because every core plugin imports `getPluginRegistry` from it at runtime.

## What's in here

- `CorePlugin<Options>` — the Payload plugin signature every core package exports
- `BaseCorePluginOptions` — options every plugin accepts (`enabled`, `logger`, and `routePrefix` for a plugin that serves HTTP endpoints of its own)
- `McpToolDefinition`, `McpToolContext`, `McpMeta` — the MCP tool surface
- `AuthenticatedUser` — the actor a tool handler receives
- `getPluginRegistry` — the runtime registry plugins use to announce themselves and check for sibling plugins
- `examplePlugin` — a reference implementation showing the exact shape every future plugin follows

## Authoring a plugin

See `docs/building-plugins.md` at the repo root.
