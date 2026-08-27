# @forumone/throughline-forms

## 0.4.0

### Minor Changes

- 1a4a441: Let every server's tools be served by Payload's own MCP plugin

  `createMcpToolCollector()` in core, and an `mcpTools` option on all six servers. The host hands the collector's array to `@payloadcms/plugin-mcp` at config time and each plugin fills it at `onInit` — which works because the plugin reads `mcp.tools` inside the handler it builds per request, so an array handed over empty is read populated.

  That ordering is the whole problem this solves: every tool in the suite is built at `onInit` because every one closes over `payload`, and `mcpPlugin` takes its tools as a config option.

  Omit `mcpTools` and nothing changes — each server keeps its own `/mcp` endpoint, which is what lets a host move one at a time rather than all six at once.

  Duplicate tool names are refused, naming both servers. Six servers each owning a `publish` was fine while each had its own endpoint; one server is one namespace, and an MCP client offered two tools under one name gets whichever registered last.

  **Also fixes a defect the integration test found.** `service.loadDocument` called `findByID` without `disableErrors`, so a missing document threw `NotFound` before the pipeline ran — which made the `exist` step's `not-found` branch unreachable from every caller, and turned "publish a document that does not exist" into a thrown error instead of the diagnostic the pipeline exists to return. The step's own tests passed it an empty document and so never noticed. `unpublish` now distinguishes a missing document from one that is merely already a draft.

### Patch Changes

- Updated dependencies [1a4a441]
  - @forumone/throughline-core@0.5.0
  - @forumone/throughline-email@0.2.5

## 0.3.0

### Minor Changes

- 9f39ace: Enforce API-key scopes, which until now were only a label

  The API-keys collection has always had a required `scopes` field, the README has always told you to mint keys with `--scopes publishing.execute`, and the scheduled-publish factory documents that its key "must carry `publishing.execute` scope". Nothing read the field. Every key could do whatever its linked user could, whatever it said on the label.

  A tool may now declare `requiredScope`, and the handler holds callers to it: the tool is hidden from `tools/list` and refused on a direct call unless the key names that scope. Hidden as well as refused, because an agent shown a tool it will be turned away from will try it, fail, and report the tool as broken when what is narrow is the key.

  The consequential tools are annotated — `publish`, `unpublish`, `schedule_publish`, `rollback` (`publishing.execute`); `request_approval` (`approvals.request`); `respond_to_approval` (`approvals.decide`); the three form writers (`forms.manage`); `trigger_sync` and `test_integration` (`integrations.trigger`). Reads are left unscoped, which is the right default for a read.

  **This narrows existing keys.** A key minted with one scope could previously call every tool on every server and now cannot. That is the point, but it will change what an existing MCP client can do — check the scopes on your keys before upgrading. A key carrying no scopes at all passes nothing scoped: absent is read as none, not as everything.

### Patch Changes

- f138b3d: One audit actor shape for every tool, and stop recording agents as people

  Ten tools built the audit actor by hand and four of them disagreed. Three were only untidy — a dropped `userName`, conditional spreads, an assumption that `ctx.user` is non-null. The fourth was wrong: the component tools wrote `type: 'user'` unconditionally, so a call made with an API key and no linked user was recorded as a person. An audit log that cannot tell an agent from an editor is not an audit log.

  `auditContext(ctx, meta)` is now exported from core and used at all eight tool call sites. `type` follows the rule the publishing service already used — a call carrying a user is that user's, one without is the system's — and `apiKeyName` rides along either way, because a key acting for a linked user is still worth naming.

  It also passes `sessionId` through for the first time. The column has been on the audit collection since it was written and nothing ever filled it; it is what lets somebody reading the log group one conversation's writes instead of reading them one at a time.

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0
  - @forumone/throughline-plugin-contract@0.3.0
  - @forumone/throughline-email@0.2.4

## 0.2.2

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0
  - @forumone/throughline-email@0.2.3

## 0.2.1

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2
  - @forumone/throughline-email@0.2.2

## 0.2.0

### Minor Changes

- a4b5108: Initial release of the forms package. Wraps Payload's Form Builder plugin with the Throughline policy layer: mandatory privacy notice, consent enforcement (server-side), honeypot spam protection, Postgres-backed per-IP rate limiting, a destination allowlist (the security perimeter), and submitter confirmations. Six MCP tools (`list_allowed_destinations`, `validate_form`, `create_form`, `update_form_fields`, `update_form_destinations`, `get_form_submissions`) and four Inngest functions (`form-fan-out`, `form-email-destination`, `form-webhook-destination`, `form-submitter-confirmation`) drive the conversational flow and the async destination delivery. Includes `FormSubmissionEmail` and `SubmitterConfirmationEmail` React Email templates. Allowlist enforcement runs at three layers (MCP tool, collection beforeChange hook, fan-out worker) so prompt injection or admin direct-API writes can't bypass it. IPs are HMAC-hashed; raw IPs are never persisted. Adds `form.updated` to the core audit-action taxonomy used by the two update tools.

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1
  - @forumone/throughline-email@0.2.1
