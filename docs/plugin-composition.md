# How core plugins compose

Client apps compose Throughline core plugins by listing them in their Payload config's `plugins` array. Ordering matters for some plugins — the audit and components plugins install hooks and validators that other plugins lean on, so they must load first.

## Recommended order

Always load in this order:

1. `auditPlugin` — first, because it provides hooks other plugins use.
2. `componentsPlugin` — next, because publishing depends on composition validation.
3. `publishingPlugin`
4. `approvalsPlugin`
5. `formsPlugin`
6. `integrationsPlugin` — last, because it subscribes to events emitted by the others.

Plugins that depend on another plugin assert that dependency at load time through the shared registry and fail loudly if the dependency is missing. They do not try to work around missing dependencies silently.

## Naming

- Plugin function: `<feature>Plugin` (camelCase) — e.g. `publishingPlugin`
- Options type: `<Feature>PluginOptions` (PascalCase) — e.g. `PublishingPluginOptions`
- Package entry point: re-exports both

## Type imports

Client apps import the options types so IDE autocomplete drives configuration:

```typescript
import type { PublishingPluginOptions } from '@forumone/throughline-publishing'

const publishingConfig: PublishingPluginOptions = {
  // IDE autocompletes every option
}
```

## Options validation

Every plugin validates its options at load time using Zod. Invalid configuration throws immediately with a clear error message. This prevents runtime failures caused by misconfiguration.

## Environment variables

Plugins follow these conventions for env var names:

- `<FEATURE>_SERVER_API_KEY` — bearer token accepted by the plugin's MCP server
- `<FEATURE>_TOKEN_SECRET` — signing secret for plugin-specific tokens (e.g. approval action tokens)

Every plugin documents its required env vars in its `README.md`.

## Disabling a plugin

Every plugin accepts `enabled?: boolean`. Set it to `false` to pass the plugin through as a no-op without removing it from the config:

```typescript
publishingPlugin({ enabled: process.env.NODE_ENV !== 'test' })
```

This is preferred over conditionally including the plugin in the array, because it keeps configuration shape stable across environments.

## Route prefixes

Every plugin accepts `routePrefix?: string`. The default is plugin-specific (`/api/publishing`, `/api/approvals`, …). Override only when you need to avoid a collision with a client-app route.
