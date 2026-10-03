---
'@forumone/throughline': patch
---

Approvals on Postgres, and approvals when an event cannot be sent:

- **Confirming a decision from an approval email works on Postgres.** The action endpoint wrote the token's approver id as a string into `decidedBy`, a relationship to a users collection whose ids are numbers there, so every emailed decision failed on Confirm. It now writes the id in the users collection's type, as `request_approval` and `respond_to_approval` do since 1.0.1.
- **A stored request or a recorded decision is reported as one when its event cannot be sent.** `request_approval`, `respond_to_approval` and the email action endpoint wrote first and then threw if `approval/requested`, `approval/decided` or `approval/discussed` failed to send, reporting an action that had landed as failed. The tools now return it with a `warnings` entry, and the endpoint shows the approver their confirmation and logs the warning — the same rule publishing follows. `sendEventSafely` moved to a shared module for it.
