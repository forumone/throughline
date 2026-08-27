---
'@forumone/throughline-core': minor
'@forumone/throughline-components': patch
'@forumone/throughline-approvals': patch
'@forumone/throughline-forms': patch
---

One audit actor shape for every tool, and stop recording agents as people

Ten tools built the audit actor by hand and four of them disagreed. Three were only untidy — a dropped `userName`, conditional spreads, an assumption that `ctx.user` is non-null. The fourth was wrong: the component tools wrote `type: 'user'` unconditionally, so a call made with an API key and no linked user was recorded as a person. An audit log that cannot tell an agent from an editor is not an audit log.

`auditContext(ctx, meta)` is now exported from core and used at all eight tool call sites. `type` follows the rule the publishing service already used — a call carrying a user is that user's, one without is the system's — and `apiKeyName` rides along either way, because a key acting for a linked user is still worth naming.

It also passes `sessionId` through for the first time. The column has been on the audit collection since it was written and nothing ever filled it; it is what lets somebody reading the log group one conversation's writes instead of reading them one at a time.
