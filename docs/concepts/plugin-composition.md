# Plugin composition

Every Throughline package is a Payload plugin: a function `(config) => config` that adds collections, fields, hooks, endpoints, and onInit handlers. Plugins find each other through a small registry on the Payload instance and assert their dependencies at boot time.

## Why plugins, not a monolithic SDK

The framework needs to compose with whatever else a Payload project is doing — custom collections, third-party Payload plugins, the host's own access controls. A monolithic SDK ("call `setupThroughline(payload)`") would force ordering and conflict with that. Plugins compose by default.

Plugins also let clients pick up only what they need. A site without forms doesn't need the Forms plugin. The package is install-then-list-in-config and nothing more.

## Recommended order

Always load Throughline plugins in this order:

1. **`auditPlugin`** — first, because every other plugin writes to the audit log
2. **`componentsPlugin`** — composition validation; publishing depends on it
3. **`publishingPlugin`** — depends on components for composition checks
4. **`approvalsPlugin`** — depends on audit; publishing optionally depends on its `getActiveApproval`
5. **`auditQueryPlugin`** — read-only; depends on the audit log existing
6. **`emailPlugin`** — fires on `approval/*` events
7. **`formsPlugin`** — fires on `form/*` events; depends on email + audit
8. **`integrationsPlugin`** — last, because it subscribes to events from the others

Plugins assert their dependencies at boot via `requireCapability(name, callerId)`. If a plugin's prereq isn't loaded, the app fails to start with a clear message — not silently with broken behavior at runtime.

## The capability registry

Capabilities are how plugins advertise to each other. The audit plugin registers `audit-log`, the components plugin registers `components` and `composition-validator`, etc. Other plugins call:

```typescript
import { requireCapability } from '@forumone/throughline-core'

requireCapability('audit-log', '@forumone/throughline-publishing')
```

`requireCapability` throws synchronously during plugin init if the capability isn't registered yet, which forces the order described above. Order is enforced at config-build time, not at request time.

## Symbol-based cross-plugin communication

Some plugins need to expose richer surfaces than capabilities (which are boolean): the email plugin exposes a `send` client; the integrations plugin exposes its registry; the email plugin exposes its compiled functions array. They use **`Symbol.for(...)`** keys on the Payload instance:

```typescript
// Inside a plugin's onInit:
const KEY = Symbol.for('@forumone/throughline-email/getClient')
;(payload as any)[KEY] = createEmailClient(options)
```

```typescript
// In a consumer (e.g. apps/web/src/app/api/inngest/route.ts):
import { getEmailFunctions } from '@forumone/throughline-email'

const fns = getEmailFunctions(payload) ?? []
```

The plugin exports `getEmailFunctions(payload)` (a small accessor) so consumers don't have to know the symbol. Two plugins running the same version see the same `Symbol.for(...)` key — the registry is identity-based across modules.

This pattern keeps plugins decoupled. Email doesn't know about Forms. Forms looks up email lazily at the moment it sends, so plugin-load order is the only order that matters.

## Naming conventions

- Plugin function: `<feature>Plugin` (camelCase) — `publishingPlugin`
- Options type: `<Feature>PluginOptions` (PascalCase) — `PublishingPluginOptions`
- Package entry point: re-exports both
- Capability name: short kebab-case slug — `audit-log`, `composition-validator`
- Symbol key: `Symbol.for('@forumone/throughline-<package>/<accessor>')`

## What a Throughline plugin looks like

```typescript
import type { Plugin } from 'payload'
import { auditPluginEntry, registerCapability } from '@forumone/throughline-core'

export const examplePlugin = (options: ExamplePluginOptions): Plugin =>
  (incoming) => {
    return {
      ...incoming,
      collections: [
        ...(incoming.collections ?? []),
        createExampleCollection(options),
      ],
      endpoints: [
        ...(incoming.endpoints ?? []),
        createMcpEndpoint({ id: 'example', tools, options }),
      ],
      onInit: async (payload) => {
        await incoming.onInit?.(payload)
        registerCapability(payload, 'example', '@forumone/throughline-example')
        // expose your runtime API on the payload instance via Symbol.for
        // attach Inngest workers, etc.
      },
    }
  }
```

The plugin returns a *new* config — never mutates the incoming one in place — and always invokes the upstream `onInit` so chained plugins all get notified.

## What plugins should not do

- **Mutate other plugins' collections.** If you need a collection to behave differently, your plugin owns its own collection or contributes fields to a shared one through a documented hook.
- **Read state from each other directly.** Either expose a capability + getter (cross-plugin API) or fire an event (loose coupling).
- **Patch Payload internals.** If a feature requires modifying Payload itself, it belongs in core.

## Testing composition

Each plugin ships with tests that build a fake Payload config, run the plugin's mutation, and assert the resulting config has the expected collections, endpoints, and onInit behavior. The fakes are deliberately minimal — they expose just enough surface for plugin tests to work without spinning up a real database. See `packages/audit/src/_fixtures.ts` for the pattern.

## Where to look in code

- `packages/core/src/capabilities.ts` — the capability registry
- `packages/<each>/src/plugin.ts` — the entry function
- `apps/web/src/payload.config.ts` (in a generated project) — the canonical order
