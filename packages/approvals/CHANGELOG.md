# @forumone/throughline-approvals

## 0.2.2

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2
  - @forumone/throughline-publishing@0.2.3

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1
  - @forumone/throughline-publishing@0.2.2

## 0.2.0

### Minor Changes

- 3ef6f6a: Initial release. Conversational approval workflow server with HMAC-signed single-use action tokens, per-group approver resolution, first-decision-wins semantics, version-bound approvals, seven-day default expiration, an HTML confirmation flow on the action endpoint, and five MCP tools (`request_approval`, `respond_to_approval`, `get_approval_status`, `list_pending_approvals`, `list_my_requests`). The plugin's `onInit` attaches the approval resolver to the Payload instance under `Symbol.for('@forumone/throughline/approvals-resolver')` so the publishing server can look it up automatically.

### Patch Changes

- Updated dependencies [3ef6f6a]
  - @forumone/throughline-publishing@0.2.1
