---
'@forumone/throughline': major
---

The last five 0.x server packages move in, by `docs/spec/1.0-exports.md`:

- `@forumone/throughline-audit` joins core's audit writer on `@forumone/throughline/audit`. `DEFAULT_AUDIT_COLLECTION_SLUG` is gone; use `DEFAULT_AUDIT_SLUG`, the same value.
- `@forumone/throughline-approvals` is `/approvals`. `APPROVALS_RESOLVER_SYMBOL` is internal.
- `@forumone/throughline-components` is `/components`.
- `@forumone/throughline-integrations` is `/integrations`; its `/client` (`SyncButton` and helpers) joins `@forumone/throughline/client`.
- `@forumone/throughline-email` and its `/templates` are `/email`. `DEFAULT_APPROVALS_COLLECTION_SLUG` is gone; use `DEFAULT_APPROVALS_SLUG` from `/approvals`, the same value. `validateOptions` is internal.

**Removed:** `createNotifyApprovalRequestFunction`, `createNotifyApprovalDecisionFunction` and `createNotifyApprovalExpiredFunction`. `emailPlugin` builds the same three Inngest functions itself, so `getEmailFunctions` and the function ids are unchanged; run `notify…Job` through an adapter to build one by hand.

Admin component paths follow: `@forumone/throughline/client#SyncButton`. Plugin ids in the registry are `@forumone/throughline/<subpath>`, with the audit query plugin at `/audit-query`.
