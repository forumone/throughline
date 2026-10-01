---
'@forumone/throughline-plugin-contract': minor
'@forumone/throughline-core': minor
'@forumone/throughline-approvals': minor
'@forumone/throughline-integrations': minor
'@forumone/throughline-forms': minor
---

Collections that Throughline plugins declare now sit in a `Throughline` group in the admin sidebar, instead of loose at the top of it above every group. That covers `audit-events` (`auditPlugin`), the approvals collection (`approvalsPlugin`), `integrations` (`integrationsPlugin`), and `forms` and `form-submissions` (`formsPlugin`).

Each of those plugins accepts `admin: { group }`, which applies to every collection it declares:

- omitted: the `Throughline` group.
- a string, or a locale map such as `{ en: 'Workflow', fr: 'Flux' }`: that group.
- `false`: ungrouped, in Payload's default "Collections" section. This does not hide the collection, which is what `false` means on a collection's own `admin.group`.

A site that groups these collections with its own config plugin can pass `admin: { group }` to each plugin and delete that code. `createAuditCollection`, `createApprovalsCollection` and `createIntegrationsCollection` accept the same `admin` option.

`@forumone/throughline-plugin-contract` exports the shared pieces: `CollectionPluginOptions`, `PluginAdminOptions`, `PluginAdminGroup`, `DEFAULT_ADMIN_GROUP` and `resolveAdminGroup`, the helper a plugin spreads into each collection's `admin` block. `@forumone/throughline-core` re-exports the types.
