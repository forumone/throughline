---
'@forumone/throughline': minor
---

Adds `create_draft` and `update_draft` to the content tools. Both write drafts only and refuse `_status`, publishing dates, the approval policy and any field off the site's allow-list. They refuse a document someone has open in the admin, naming the person (even when it's the key's own person, whose tab would autosave over the change). They also refuse a block the field doesn't offer, a layout that breaks the composition rules, and a slug that's taken, including one held in the trash. Each write is recorded in the audit log with the caller's `_meta`.

**Upgrading: a migration.** The key collection gains two checkbox columns, one per new tool. Run `migrate:create` and apply it before deploying.
