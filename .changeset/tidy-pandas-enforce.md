---
'@forumone/throughline-publishing': patch
'@forumone/throughline-core': patch
---

The five publishing MCP tools now refuse an unauthenticated call and run their
reads and writes as the caller.

`publish`, `unpublish`, `rollback`, `schedulePublish` and `getPublishStatus`
built their actor without `enforceAccessAs`, which is the only thing that makes
the service pass `{ user, overrideAccess: false }` to Payload. So every one of
them ran at the Local API default of `overrideAccess: true` — publish,
unpublish, roll back or schedule any document in any collection with no
authorization check. `rollback` called `restoreVersion` with no user and no
override flag at all.

`tools/actor.ts` refuses when there is no identity and hands the caller to the
service as the principal to enforce against. Deliberately not a role gate: the
admin HTTP path already requires a user, sets `enforceAccessAs`, and lets the
collection's own `update` rule decide. The MCP path now participates in that
rather than carrying a second policy.

**Behavioural change for consumers.** A tool call arriving with no `ctx.user`
now returns `{ error: 'Must be authenticated…' }` instead of performing the
operation. In practice that is every `Bearer`-authenticated MCP call, because
`@payloadcms/plugin-mcp` does not assign `req.user` — which is why the audit,
integrations and approvals servers already denied and these five did not.

`@forumone/throughline-core`'s README claimed `requiredScope` is enforced —
hidden from `tools/list` and refused unless granted. It was, by an `auth.ts`
that "one MCP transport, not seven" (#80) removed along with the six
per-server endpoints. The declarations survived; the enforcement did not. The
README now says so, and says what gates a tool instead.
