# @forumone/throughline-workflows

## 0.6.7

### Patch Changes

- Updated dependencies [fd4f42d]
  - @forumone/throughline-core@0.14.0
  - @forumone/throughline-publishing@0.15.2

## 0.6.6

### Patch Changes

- Updated dependencies [841b91b]
  - @forumone/throughline-core@0.13.0
  - @forumone/throughline-publishing@0.15.1

## 0.6.5

### Patch Changes

- Updated dependencies [01210dc]
  - @forumone/throughline-publishing@0.15.0

## 0.6.4

### Patch Changes

- Updated dependencies [e687cb7]
  - @forumone/throughline-publishing@0.14.0

## 0.6.3

### Patch Changes

- Updated dependencies [51f7ea0]
  - @forumone/throughline-publishing@0.13.0

## 0.6.2

### Patch Changes

- Updated dependencies [689929e]
  - @forumone/throughline-publishing@0.12.0

## 0.6.1

### Patch Changes

- Updated dependencies [4289ee2]
  - @forumone/throughline-core@0.12.0
  - @forumone/throughline-publishing@0.11.2

## 0.6.0

### Minor Changes

- c1db470: The approval notifications run on any jobs runner.

  - **email:**
    - `notifyApprovalRequestJob`, `notifyApprovalDecisionJob` and `notifyApprovalExpiredJob` are the three notifications as runner-neutral jobs. Each takes a resolver for its dependencies.
    - The `create…Function` factories keep their signatures and their Inngest registration, held by a snapshot written before the port.
    - `emailJobs(options)` returns all three for a site that hands its jobs to `payloadJobs().plugin(...)`. They find Payload on the job context and the email client on Payload, so `emailPlugin` must be registered too.
    - `inngest` is now optional on `emailPlugin`. Without it, the plugin registers no Inngest functions, and the site runs `emailJobs` instead.
  - **workflows:** the job context carries `payload` when the runner has one: always on Payload Jobs, and on Inngest when `inngestJobs(inngest, { payload })` is given it. This is for jobs a plugin declares before Payload exists.

- 52f6ef6: Adds runner-neutral jobs, the first piece of 1.0 P1. This is purely additive: every existing factory still registers its Inngest function directly, exactly as before.

  - `defineJob(definition, handler)` describes a background job once.
    - The definition holds an `id`, an `on` trigger (`{ event }` or `{ cron }`), and optional `retries`, `concurrency`, `idempotency` (`{ fields, separator? }` over `event.data`) and `onFailure`.
    - The handler receives `{ event, step, runId, logger }`, where `step` offers `run`, `sleepUntil` and `sendEvent`, and `event.ts` is the send time, for replay-safe arithmetic.
  - `inngestJobs(inngest, { onFailure? })` runs jobs on Inngest.
    - `functions(jobs)` gives the array for `serve()`, and `emit()` sends events.
    - A job registers with the config a hand-written `createFunction` had: the same id and trigger, and idempotency compiled back to the same CEL string. Moving a function onto it changes nothing Inngest can see.
  - `inngestFunctionConfig` and `inngestIdempotency` expose that config, for tests.

- c278b66: Adds `payloadJobs()`, which runs `defineJob` jobs on Payload's own job queue, so a site can use Throughline's background work without Inngest. This is additive: nothing existing changes.

  - `plugin(jobs)` registers each job as a Payload workflow, with cron jobs on Payload's schedule. `emit()` queues one job per subscriber to an event.
  - `step.run` is an inline task, so its output is memoized across retries.
  - `step.sleepUntil` ends the job and queues a continuation with `waitUntil`. The continuation carries every step value, so nothing before the sleep runs again.
  - Idempotency is kept in a `throughline-job-keys` collection with a unique index, for 24 hours by default. It is a collection of its own because Payload deletes completed jobs. The collection is added only when some job declares idempotency.
  - `onFailure` runs once, on the final attempt.
  - `concurrency` becomes "one at a time" for the job, because Payload's control is a per-key lock, not a count. Setting it turns on `enableConcurrencyControl`, which adds a column to `payload-jobs`, so a site adopting this needs a migration.
  - Something has to run Payload's queue: `jobs.autoRun` on a long-lived server, or a scheduler calling `/api/payload-jobs/run` and `/api/payload-jobs/handle-schedules` on Vercel.

- 6e4edf0: Lets a site run every workflow on Payload Jobs, configured before Payload exists. Additive: every existing call keeps working.

  - `payload` is optional on the job builders for the healthcheck, publish revalidation, scheduled publishing and its backstop, and approval expiry. Without it, a job uses the Payload instance on its run context, so it can be declared in `buildConfig`. `jobPayload()` and `JobOptions` are exported for jobs written the same way. A job with neither throws an error that names it.
  - `publish` (the scheduled-publish callback) now gets a second argument, `{ payload }`, so it no longer has to close over an instance.
  - `eventSenderFor(jobs)` returns an Inngest-shaped client that only sends, through a jobs adapter's `emit`. It is for the plugins that take an `inngest` only to announce events (audit, approvals, publishing) on a site with no Inngest. It is transitional, and 1.0 replaces those options with the adapter itself.

- ac92ab4: Every workflow is now also a runner-neutral job, so it runs on `payloadJobs()` as well as on Inngest.

  - `revalidateOnPublishJob`, `executeScheduledPublishesJob`, `publishAtScheduledTimeJob`, `expireStaleApprovalsJob`, `auditEventEchoJob` and `healthcheckJob` take the same options as their `create…Function` factory, without `inngest`.
  - The factories keep their signatures. Each now registers `inngestJobs(inngest).toFunction(theJob(options))`, and the config it registers is unchanged: a snapshot test written from the old factories holds every id, trigger, idempotency key, concurrency and retry count.
  - A job may answer several events, as `on: { event: [...] }`, the way `revalidate-on-publish` answers publish, unpublish and rollback.
  - The job context gains `emit()`, for a send that belongs to the step it sits inside, as when expiring an approval also announces it.
  - `jobEvents(job)` lists the events a job answers.

### Patch Changes

- Updated dependencies [a8e06fc]
  - @forumone/throughline-core@0.11.0
  - @forumone/throughline-publishing@0.11.1

## 0.5.0

### Minor Changes

- ab623e1: The `payload` peer range moves from `^3.0.0` to `^3.89.0` for every package that has one. **A site on Payload older than 3.89.0 must upgrade Payload before upgrading these packages.**

  Before 3.89.0, the `payload-mcp-api-keys` collection that `@payloadcms/plugin-mcp` adds registered Payload's API-key strategy on every REST route. Any key could then become `req.user` outside `/api/mcp` and pass access rules written as `Boolean(req.user)`. Every Throughline site runs that plugin, so the floor is the same for every package. No package's code changes with this bump.

- 653817e: Revalidation no longer guesses paths, and covers the changes a publish event never announces.

  - **workflows (breaking)**: `createRevalidateOnPublishFunction` has no built-in URL
    builders. They mapped `pages` to `/<slug>`, `posts` to `/blog/<slug>` and any other
    collection to `/<slug>`, so a site whose routes differed revalidated the wrong path
    without a word. `urlBuilders` is now required; a collection with no entry has its
    tags dropped and no path revalidated, and the run logs a warning. To keep the old
    behaviour, pass the old builders:

    ```ts
    urlBuilders: {
      pages: (slug) => (slug === 'home' || slug === '' ? '/' : `/${slug}`),
      posts: (slug) => `/blog/${slug}`,
    }
    ```

    and then check them against your routes.

  - **workflows**: `createTagRevalidationHooks` — collection `afterChange` and
    `afterDelete`, and global `afterChange`, hooks that call
    `revalidateTag(tag, { expire: 0 })`. Draft saves and autosave drop nothing (via
    publishing's `isDraftWrite`); an unpublish still does. A hook never throws: outside a
    Next request (seeds, migrations, the CLI) it logs at `debug`, and any other failure
    at `error` with the tag and the cause.
  - **workflows**: `createCacheTags` builds every tag string, so the hooks, the publish
    workflow (new `cacheTags` option) and cached reads cannot name different tags.
    Defaults: the bare slug for a collection, `global_<slug>` for a global. Also on the
    dependency-free `@forumone/throughline-workflows/cache-tags` subpath for frontend code.
    `@forumone/throughline-publishing` is now a dependency of this package.
  - **create-throughline**: the scaffold adds `apps/web/src/lib/cache-tags.ts`, attaches
    the tag hooks to `Pages`, and passes explicit `urlBuilders` and the shared
    `cacheTags` to the publish workflow.

- 70385c4: `onTerminalFailure` has a handler to pass it. `createTerminalFailureHandler({ payload })` logs a run that exhausted its retries, writes a `job-failures` row through core's `jobFailuresPlugin` when it is registered, and posts the report to `ERROR_WEBHOOK_URL`. `createHealthcheckFailureHandler({ payload })` does the same for the healthcheck's per-run `onFailure`. Neither throws, because a throwing `onFailure` is retried by Inngest. The terminal handler also works as the `onFailure` of any Inngest function.

  Recording rows needs core's `jobFailuresPlugin` and its migration. Without the plugin, the handlers still log and report.

### Patch Changes

- Updated dependencies [006ae30]
- Updated dependencies [549d292]
- Updated dependencies [70385c4]
- Updated dependencies [c8a86bf]
- Updated dependencies [ab623e1]
- Updated dependencies [ab623e1]
- Updated dependencies [36728c4]
  - @forumone/throughline-core@0.10.0
  - @forumone/throughline-publishing@0.11.0

## 0.4.0

### Minor Changes

- 35060e5: Scheduled publishing works from the admin, publishes on time, and cleans up after itself.

  A schedule set from the admin never published. It was written by a draft save,
  Payload keeps a draft save in the versions table only, and the cron read the main
  row — so only a schedule written over MCP, by a non-draft update, was ever found.
  - **publishing**: a Schedule control replaces the scheduled-publish date field on
    any collection that declares one, and runs the pipeline's checks when a time is
    picked. An approval not yet granted, or an embargo that ends first, schedules
    with a warning rather than refusing. `schedule` and `unschedule` admin
    endpoints, `PublishingService.schedule` / `.unschedule`, and
    `scheduleDocument` / `unscheduleDocument`; `schedule_publish` now calls the
    service and writes the time as a draft. An `afterChange` hook sends
    `content/page.scheduled` whenever the time changes, whichever route set it.
    Publishing and unpublishing clear the time, so an unpublished page can no longer
    put itself back up.
  - **workflows**: `createPublishAtScheduledTimeFunction` sleeps until the scheduled
    time instead of polling, in six-day hops for schedules further out.
    `createExecuteScheduledPublishesFunction` reads the latest version
    (`draft: true`) and takes `overdueByMs`, for running it as a backstop.

## 0.3.1

### Patch Changes

- Updated dependencies [d02772f]
  - @forumone/throughline-core@0.9.1

## 0.3.0

### Minor Changes

- 7fc0c19: Every workflow factory now takes `onTerminalFailure` and `concurrency`.

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
  different — once per run with the checks that failed, on the _first_ bad run,
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

## 0.2.11

### Patch Changes

- Updated dependencies [debfcd2]
  - @forumone/throughline-core@0.9.0

## 0.2.10

### Patch Changes

- Updated dependencies [262768a]
  - @forumone/throughline-core@0.8.2

## 0.2.9

### Patch Changes

- 957403b: One `@types/node`, so a host does not end up with two copies of `@payloadcms/ui`

  Twelve packages asked for `@types/node@^20.17.0` and `design-system-payload`
  asked for `^24.13.2`. Inside this repository that is untidy. Inside a host that
  consumes the suite from source — which is how `forumone/forumone-2026` uses it,
  as a git submodule in one pnpm workspace — it is a runtime failure.

  pnpm hashes a package's identity with its resolved peers. `publishing` and
  `integrations` both take `@payloadcms/ui` as a peer _and_ as a devDependency, so
  each got its own copy resolved against `@types/node@20`, while the host's copy
  resolved against `@types/node@24`. Same version, 3.87.1, two directories:

      apps/web                     → @payloadcms+ui@3.87.1_…_9ce0de5c…
      packages/publishing          → @payloadcms+ui@3.87.1_…_13184ec4…
      packages/integrations        → @payloadcms+ui@3.87.1_…_13184ec4…

  Two directories are two module instances. Two instances of `@payloadcms/ui` are
  two `ConfigContext` objects, and `PublishButton` read the one the admin's
  provider had never populated:

      TypeError: Cannot destructure property 'config' of useConfig() as it is undefined

  The host saw an intermittent 500 on every admin document view — `PublishButton`
  is installed on each collection with a publish policy, so lists, `/admin` and
  the login screen were all fine and only editing broke. Nothing caught it:
  install, `--frozen-lockfile`, typecheck, lint and every test passed, because the
  two copies are byte-identical and the split exists only at module resolution.
  forumone/forumone-2026#498.

  Aligning on `^24.13.2` collapses them to one instance. Nothing here targets a
  Node 20 API deliberately; the packages typecheck and test unchanged against the
  newer types.

  `create-throughline` keeps `^20.17.0` on purpose. It is the one package
  declaring `engines.node: >=20.9.0`, and typechecking a CLI against types newer
  than the runtime it promises to support is how a Node 24-only call ships to
  somebody on Node 20.

- Updated dependencies [957403b]
  - @forumone/throughline-core@0.8.1

## 0.2.8

### Patch Changes

- Updated dependencies [a9262da]
  - @forumone/throughline-core@0.8.0

## 0.2.7

### Patch Changes

- Updated dependencies [3140ea0]
  - @forumone/throughline-core@0.7.0

## 0.2.6

### Patch Changes

- Updated dependencies [9131065]
  - @forumone/throughline-core@0.6.0

## 0.2.5

### Patch Changes

- Updated dependencies [1a4a441]
  - @forumone/throughline-core@0.5.0

## 0.2.4

### Patch Changes

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0

## 0.2.3

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [7ee992d]
  - @forumone/throughline-core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- 28f5af4: Initial release of the workflows package. Five composable Inngest function factories for the common async work in the framework: `createRevalidateOnPublishFunction` (Next.js cache invalidation on publish), `createExecuteScheduledPublishesFunction` (cron-driven scheduled publishes that go through the Publishing Server's MCP for full pipeline coverage), `createExpireStaleApprovalsFunction` (daily approval expiration with audit + `approval/expired` event), `createAuditEventEchoFunction` (fan-out for approval lifecycle plus pluggable custom handlers), `createHealthcheckFunction` (configurable checks with `onFailure` routing and a `system/healthcheck` heartbeat). Plus reusable `createPayloadReachableCheck` and `createManifestReachableCheck` helpers. No Payload plugin — factories only; client apps merge the functions into their Inngest endpoint. `next` is an optional peer dependency.
