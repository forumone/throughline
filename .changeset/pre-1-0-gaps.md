---
'@forumone/throughline': major
---

Smaller gaps closed before 1.0:

- `Integration.createFunctions` is optional. `throughline()` runs `createJobs` and never called it.
- `auditQuery.readAccess` now applies: it takes the tool's context, `(ctx) => boolean`, and replaces the admin/editor rule for the five audit tools. It was declared with a `PayloadRequest` and read by nothing.
- `job-failures` takes an `admin` sidebar group like every other Throughline collection, and gets the suite's from `throughline()`.
- An accessibility issue of severity `warning` reaches the publish result's `warnings` instead of being dropped.
- The webhook integration no longer subscribes to `form/submission.received`, which nothing sends since forms left the suite; the stored filter option stays. Stale text naming forms, the "Approvals Server" and 0.x paths is corrected.
