# @forumone/throughline-integrations

## 0.2.2

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- 789dbd8: Initial release of the integrations server. Provides the `Integration` plugin contract every future integration (Salesforce, Mailchimp, etc.) follows, the registry, the admin-only Integrations collection, and five MCP tools (`list_integrations`, `get_integration_status`, `trigger_sync`, `test_integration`, `list_integration_types`). Includes a generic outbound webhook integration with HMAC-SHA256 signing (RFC 4231 known-answer tests pinned), configurable event filter / payload mode / timeout, healthcheck, and Inngest-driven retries. Configuration is admin-only by design — Claude can trigger and observe integrations but cannot retarget URLs or rotate secrets.
