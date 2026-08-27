# @forumone/throughline-email

## 0.2.6

### Patch Changes

- 9131065: Three helpers that existed once per package now exist once
  - **`unwrapRelationshipId`** had four definitions — three private to `approvals`, one exported from `email` — differing only in a null guard that `typeof value === 'string'` already covers. One deliberate change comes with the move: none of the four handled a _numeric_ id, so on Postgres at `depth: 0` they returned `null` for a relationship that was populated fine. No caller reads at depth 0 today, so this fixes nothing and stops a shared helper being wrong for the first caller that does.
  - **`deniedEnvelope`** had three identical definitions, one per server with an access predicate. The role predicates stay where they are: what counts as an audit reader is not what counts as a forms author, and collapsing those would put one package's policy in another's file.
  - **The MCP handler rebuilt `createNamedLogger` inline**, forty lines from the real one in the same package.

  Nothing else in the duplication audit survived checking. `createFakePayload` has six definitions and three distinct implementations — a query engine, a two-line map read, and a stateful form store — which share a name and nothing else; merging them means building a fake that does all three jobs. `createFakeInngest` has one definition and three importers. The six MCP endpoint stanzas are real duplication that should be deleted rather than merged, once hosts move to `@payloadcms/plugin-mcp`.

- Updated dependencies [9131065]
  - @forumone/throughline-core@0.6.0

## 0.2.5

### Patch Changes

- Updated dependencies [1a4a441]
  - @forumone/throughline-core@0.5.0

## 0.2.4

### Patch Changes

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0
  - @forumone/throughline-plugin-contract@0.3.0

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
