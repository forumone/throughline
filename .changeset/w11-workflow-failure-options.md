---
'@forumone/throughline-workflows': minor
---

Every workflow factory now takes `onTerminalFailure` and `concurrency`.

Audit 06 F-09, found in the only consumer: across that app and all seventeen
packages here, `onFailure|idempotency|concurrency|singleton` matched no function
config at all. A run that exhausted its retries stopped — no dead-letter row, no
email, no page — and 12 H1 is what that cost: `expire-stale-approvals` threw at
02:00 UTC every night for eighteen days, in every environment, and nobody
noticed. A host had no way to be told, because the factories took no option.

Both live on `BaseWorkflowOptions`, so a host wires failure handling once rather
than per factory, and `failureOptions` is the single place the translation
happens.

`onTerminalFailure`, not `onFailure`, and the collision that forced the name is
worth knowing: `HealthcheckOptions.onFailure` already exists and means something
different — once per run with the checks that failed, on the *first* bad run,
because a probe has no retries to exhaust. Both are useful and a healthcheck can
take both. One name for two moments would have made every call site ambiguous
about which it was wiring.

`concurrency` defaults to 1 on the three functions that need it and is absent on
the two that do not, which is a claim about which of them race:

- `execute-scheduled-publishes` and `expire-stale-approvals` both collect a set
  of due rows and then act on them. Overlapping runs find the same row and both
  act — a document published twice through a pipeline that gates on approvals,
  or a requester told twice that their request lapsed.
- `healthcheck` is capped because two probes report one outage twice.
- `revalidate-on-publish` and `audit-event-echo` are left uncapped. Revalidating
  twice is the same as revalidating once, and one audit row is one event, so
  serialising them would put a queue in front of every publish and every audited
  write for no correctness gain.

A host passing `concurrency` overrides the default; passing 0 is honoured rather
than read as absent.

`AuditEventEchoOptions` takes an `inngest` and no `payload`, so it is not a
`BaseWorkflowOptions`. Rather than exclude it from failure handling for a reason
unrelated to failure handling, `failureOptions` reads a narrower
`FailureAwareOptions` and that interface extends it.

New exports: `failureOptions`, and the types `WorkflowFailureHandler` and
`FailureAwareOptions`.
