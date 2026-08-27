---
'@forumone/throughline-core': minor
'@forumone/throughline-approvals': patch
'@forumone/throughline-audit': patch
'@forumone/throughline-email': patch
'@forumone/throughline-forms': patch
'@forumone/throughline-integrations': patch
---

Three helpers that existed once per package now exist once

- **`unwrapRelationshipId`** had four definitions — three private to `approvals`, one exported from `email` — differing only in a null guard that `typeof value === 'string'` already covers. One deliberate change comes with the move: none of the four handled a *numeric* id, so on Postgres at `depth: 0` they returned `null` for a relationship that was populated fine. No caller reads at depth 0 today, so this fixes nothing and stops a shared helper being wrong for the first caller that does.
- **`deniedEnvelope`** had three identical definitions, one per server with an access predicate. The role predicates stay where they are: what counts as an audit reader is not what counts as a forms author, and collapsing those would put one package's policy in another's file.
- **The MCP handler rebuilt `createNamedLogger` inline**, forty lines from the real one in the same package.

Nothing else in the duplication audit survived checking. `createFakePayload` has six definitions and three distinct implementations — a query engine, a two-line map read, and a stateful form store — which share a name and nothing else; merging them means building a fake that does all three jobs. `createFakeInngest` has one definition and three importers. The six MCP endpoint stanzas are real duplication that should be deleted rather than merged, once hosts move to `@payloadcms/plugin-mcp`.
