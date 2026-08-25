# @forumone/throughline-email

## 0.2.3

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

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

- fab82fc: Initial release of the email package. Pairs Resend with React Email templates and ships the three notification Inngest functions that close the approval workflow loop. Templates: `ApprovalRequestEmail` (preview + Approve / Request changes / Discuss), `ApprovalDecisionEmail` (granted / declined / changes-requested variants with decision-aware next-step copy), `ApprovalExpiredEmail`. All render to HTML and plaintext from the same React tree. Functions: `createNotifyApprovalRequestFunction` (subscribes to `notification/send-approval-request`, sends per approver in `notifiedApprovers` with each in its own `step.run`), `createNotifyApprovalDecisionFunction` (subscribes to `notification/send-approval-decision`), `createNotifyApprovalExpiredFunction` (subscribes to `approval/expired`). Themed via `EmailBrandTokens` (neutral defaults; brand name lands in header / From name / footer for consistency). Plugin exposes the client and functions via Symbols (`getEmailClient`, `getEmailFunctions`) for the client app's Inngest endpoint to compose. Throws at init if `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `resolveApprover` / `resolveRequester` / `buildActionUrl` are missing.
