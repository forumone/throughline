---
"@forumone/throughline-plugin-contract": patch
"@forumone/throughline-core": patch
"@forumone/throughline-components": patch
"@forumone/throughline-forms": patch
"@forumone/throughline-publishing": patch
"@forumone/throughline-approvals": patch
"@forumone/throughline-audit": patch
"@forumone/throughline-integrations": patch
"@forumone/throughline-email": patch
"@forumone/create-throughline": patch
---

Fix broken external installs of the core plugins.

Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

`plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.
