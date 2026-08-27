---
'@forumone/throughline-publishing': patch
---

Respect document locks on publish, unpublish and schedule

Payload locks a document while somebody has it open in the admin, and the Local API overrides that lock by default. Every write in this package took the default — so an agent publishing over MCP pushed a document live while an editor was part-way through revising it, and nothing anywhere said so. `schedule_publish` did the same, more quietly.

All three now pass `overrideLock: false`. A lock blocks only when it is held by somebody else and has been touched within its duration (five minutes by default), so an editor publishing their own open document still passes, and an abandoned tab stops blocking on its own within a few minutes.

A locked document comes back as a pipeline block — `code: 'document-locked'` — rather than a thrown error, so the admin and the MCP client both get an answer that says what to do about it: wait, or ask the person to finish.
