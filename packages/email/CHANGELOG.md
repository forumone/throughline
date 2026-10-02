# @forumone/throughline-email

## 0.4.6

### Patch Changes

- Updated dependencies [841b91b]
  - @forumone/throughline-core@0.13.0
  - @forumone/throughline-workflows@0.6.6

## 0.4.5

### Patch Changes

- @forumone/throughline-workflows@0.6.5

## 0.4.4

### Patch Changes

- @forumone/throughline-workflows@0.6.4

## 0.4.3

### Patch Changes

- @forumone/throughline-workflows@0.6.3

## 0.4.2

### Patch Changes

- @forumone/throughline-workflows@0.6.2

## 0.4.1

### Patch Changes

- Updated dependencies [4289ee2]
  - @forumone/throughline-core@0.12.0
  - @forumone/throughline-workflows@0.6.1

## 0.4.0

### Minor Changes

- c1db470: The approval notifications run on any jobs runner.

  - **email:**
    - `notifyApprovalRequestJob`, `notifyApprovalDecisionJob` and `notifyApprovalExpiredJob` are the three notifications as runner-neutral jobs. Each takes a resolver for its dependencies.
    - The `create…Function` factories keep their signatures and their Inngest registration, held by a snapshot written before the port.
    - `emailJobs(options)` returns all three for a site that hands its jobs to `payloadJobs().plugin(...)`. They find Payload on the job context and the email client on Payload, so `emailPlugin` must be registered too.
    - `inngest` is now optional on `emailPlugin`. Without it, the plugin registers no Inngest functions, and the site runs `emailJobs` instead.
  - **workflows:** the job context carries `payload` when the runner has one: always on Payload Jobs, and on Inngest when `inngestJobs(inngest, { payload })` is given it. This is for jobs a plugin declares before Payload exists.

### Patch Changes

- Updated dependencies [c1db470]
- Updated dependencies [a8e06fc]
- Updated dependencies [52f6ef6]
- Updated dependencies [c278b66]
- Updated dependencies [6e4edf0]
- Updated dependencies [ac92ab4]
  - @forumone/throughline-workflows@0.6.0
  - @forumone/throughline-core@0.11.0

## 0.3.0

### Minor Changes

- 006ae30: A missing environment variable is reported together with every other one, in a
  single error, instead of one plugin at a time.

  The plugins that read the environment at init now declare what they cannot
  start without, as data: `approvalsEnv` (`APPROVAL_TOKEN_SECRET`, 32+
  characters), `emailEnv` (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`) and `formsEnv`
  (`FORMS_IP_HASH_SECRET`, 32+ characters). Each is a list of `EnvRequirement`
  (`{ name, minLength?, why }`), a new type in `plugin-contract`, and each
  plugin's own init check now reads the same entries, so the two cannot drift.
  An empty or whitespace-only value now counts as missing in those checks.

  Core exports `assertEnvironment(...checks)`. Call it first in
  `payload.config.ts` with the plugins' lists and your own variables; it throws
  one `EnvironmentError` whose first line reads "Configuration problem: N
  environment variables are missing or invalid", followed by every missing or
  too-short variable and why it is needed. Values are never printed. An argument
  can also be a function, for a rule that is not "this name, this long", such as
  a database URL accepted under several names. `checkEnvValue` is the one-value
  check behind it, for a plugin's own backstop.

  New projects call `assertEnvironment` at the top of `payload.config.ts` with
  `approvalsEnv`, `emailEnv`, `formsEnv`, `PAYLOAD_SECRET` (32+ characters),
  `NEXT_PUBLIC_SERVER_URL` and the database resolver, and `.env.example` marks
  which variables are checked. An existing site can do the same and delete any
  hand-kept copy of the plugins' requirements.

- ab623e1: The `payload` peer range moves from `^3.0.0` to `^3.89.0` for every package that has one. **A site on Payload older than 3.89.0 must upgrade Payload before upgrading these packages.**

  Before 3.89.0, the `payload-mcp-api-keys` collection that `@payloadcms/plugin-mcp` adds registered Payload's API-key strategy on every REST route. Any key could then become `req.user` outside `/api/mcp` and pass access rules written as `Boolean(req.user)`. Every Throughline site runs that plugin, so the floor is the same for every package. No package's code changes with this bump.

### Patch Changes

- Updated dependencies [006ae30]
- Updated dependencies [549d292]
- Updated dependencies [70385c4]
- Updated dependencies [c8a86bf]
- Updated dependencies [ab623e1]
- Updated dependencies [ab623e1]
- Updated dependencies [36728c4]
  - @forumone/throughline-plugin-contract@0.5.0
  - @forumone/throughline-core@0.10.0

## 0.2.12

### Patch Changes

- Updated dependencies [d02772f]
  - @forumone/throughline-core@0.9.1

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
  - @forumone/throughline-plugin-contract@0.4.1

## 0.2.8

### Patch Changes

- Updated dependencies [a9262da]
  - @forumone/throughline-core@0.8.0

## 0.2.7

### Patch Changes

- Updated dependencies [3140ea0]
  - @forumone/throughline-plugin-contract@0.4.0
  - @forumone/throughline-core@0.7.0

## 0.2.6

### Patch Changes

- 9131065: Three helpers that existed once per package now exist once
  - **`unwrapRelationshipId`** had four definitions — three private to `approvals`, one exported from `email` — differing only in a null guard that `typeof value === 'string'` already covers. One deliberate change comes with the move: none of the four handled a _numeric_ id, so on Postgres at `depth: 0` they returned `null` for a relationship that was populated fine. No caller reads at depth 0 today, so this fixes nothing and stops a shared helper being wrong for the first caller that does.
  - **`deniedEnvelope`** had three identical definitions, one per server with an access predicate. The role predicates stay where they are: what counts as an audit reader is not what counts as a forms author, and collapsing those would put one package's policy in another's file.
  - **The MCP handler rebuilt `createNamedLogger` inline**, forty lines from the real one in the same package.

  Nothing else in the duplication audit survived checking. `createFakePayload` has six definitions and three distinct implementations — a query engine, a two-line map read, and a stateful form store — which share a name and nothing else; merging them means building a fake that does all three jobs. `createFakeInngest` has one definition and three importers. The six MCP endpoint stanzas are real duplication that should be deleted rather than merged, once hosts move to `@payloadcms/plugin-mcp`.

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
  - @forumone/throughline-plugin-contract@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

## 0.2.2

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- fab82fc: Initial release of the email package. Pairs Resend with React Email templates and ships the three notification Inngest functions that close the approval workflow loop. Templates: `ApprovalRequestEmail` (preview + Approve / Request changes / Discuss), `ApprovalDecisionEmail` (granted / declined / changes-requested variants with decision-aware next-step copy), `ApprovalExpiredEmail`. All render to HTML and plaintext from the same React tree. Functions: `createNotifyApprovalRequestFunction` (subscribes to `notification/send-approval-request`, sends per approver in `notifiedApprovers` with each in its own `step.run`), `createNotifyApprovalDecisionFunction` (subscribes to `notification/send-approval-decision`), `createNotifyApprovalExpiredFunction` (subscribes to `approval/expired`). Themed via `EmailBrandTokens` (neutral defaults; brand name lands in header / From name / footer for consistency). Plugin exposes the client and functions via Symbols (`getEmailClient`, `getEmailFunctions`) for the client app's Inngest endpoint to compose. Throws at init if `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `resolveApprover` / `resolveRequester` / `buildActionUrl` are missing.
