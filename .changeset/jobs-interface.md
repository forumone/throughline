---
'@forumone/throughline-workflows': minor
---

Adds runner-neutral jobs, the first piece of 1.0 P1. This is purely additive: every existing factory still registers its Inngest function directly, exactly as before.

- `defineJob(definition, handler)` describes a background job once.
  - The definition holds an `id`, an `on` trigger (`{ event }` or `{ cron }`), and optional `retries`, `concurrency`, `idempotency` (`{ fields, separator? }` over `event.data`) and `onFailure`.
  - The handler receives `{ event, step, runId, logger }`, where `step` offers `run`, `sleepUntil` and `sendEvent`, and `event.ts` is the send time, for replay-safe arithmetic.
- `inngestJobs(inngest, { onFailure? })` runs jobs on Inngest.
  - `functions(jobs)` gives the array for `serve()`, and `emit()` sends events.
  - A job registers with the config a hand-written `createFunction` had: the same id and trigger, and idempotency compiled back to the same CEL string. Moving a function onto it changes nothing Inngest can see.
- `inngestFunctionConfig` and `inngestIdempotency` expose that config, for tests.
