---
'@forumone/throughline-publishing': patch
---

The pipeline's `approvalStep` now falls back to looking up an approval resolver on the Payload instance under `Symbol.for('@forumone/throughline/approvals-resolver')` when no resolver is supplied via `publishingPlugin`'s `options.approvalResolver`. The `@forumone/throughline-approvals` plugin attaches its resolver under that symbol automatically, so adding approvals to a config no longer requires re-wiring the publishing plugin's options. An explicit `options.approvalResolver` still takes precedence when you need to override.
