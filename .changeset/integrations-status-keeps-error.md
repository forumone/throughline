---
'@forumone/throughline-integrations': minor
---

`ctx.updateStatus` no longer clears `lastError` on a run that was not clean, and the types now require a reason for one:

- `updateStatus(id, 'success')` takes no message and clears `lastError`.
- `updateStatus(id, 'partial' | 'failed', message)` requires the message, which replaces `lastError`. A call without one no longer typechecks. Before, a `partial` call with no message wrote `lastError: null`, so the admin showed a partial sync with no reason and lost the previous one. A JavaScript caller that still omits it now leaves `lastError` as it was.
- `updateStatus` no longer accepts `'never-run'`.
- A call that passes a status and a message that may be `undefined`, such as `updateStatus(id, report ? 'partial' : 'success', report)`, has to be split into two calls or use `statusFromProblems`.

New helpers for runs that skip some records:

- `problemReport(problems, { maxLength })` joins one line per problem with `|` into one string for `lastError` and the audit `errorMessage`. It caps the result at 500 characters by default, ending a cut report with the total, e.g. `… (40 problems in all)`. It returns `undefined` for an empty list.
- `statusFromProblems(problems)` returns `['success']` for an empty list and `['partial', report]` otherwise, to spread into `updateStatus(id, ...statusFromProblems(problems))`.

`IntegrationStatusUpdate` is exported for the status and message arguments.
