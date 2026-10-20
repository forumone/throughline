---
'@forumone/throughline': patch
---

A derived write with no `req` no longer throws. `payload.update({ …, context: DERIVED_WRITE_CONTEXT })` from a background job failed every time with `Cannot add property __throughlinePublishingDraftWrites, object is not extensible`: Payload uses the caller's context object as `req.context` without copying it, the constant is frozen, and the draft-write hook wrote its registry onto it. The hook now records onto a copy.
