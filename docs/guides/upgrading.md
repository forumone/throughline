# Upgrading from 0.x to 1.0

Goal: move a site from the 0.x packages to 1.0 without a data migration, a changed function id, or a lost scheduled publish.

0.x was fourteen packages, each wired by hand. 1.0 is three:

| 1.0                                   | Replaces                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@forumone/throughline`               | core, plugin-contract, audit, approvals, publishing, components, integrations, email, workflows |
| `@forumone/throughline-design-system` | design-contract, design-system-payload                                                          |
| `@forumone/create-throughline`        | create-throughline, reference-ds                                                                |

Forms is not in 1.0: its last 0.x, `0.7.9`, stays on npm, and its source stays on the `v0` branch. A site using it stays on 0.x for forms until it moves to something else.

The schema does not change for a site that registered the same plugins in 0.x: they add the same collections and fields under the same names, so step 7 is a check rather than a migration. The one exception is below, under "Always on". The function ids do not change either, so a run in flight survives the upgrade, scheduled publishes included.

The reasoning behind each change is in [the 1.0 plan](../spec/1.0-plan.md). The full table of where every 0.x export went is [`1.0-exports.md`](../spec/1.0-exports.md).

## Before you start

- **Be on the last 0.x of everything.** The 1.0 shapes arrived in 0.x first: jobs, the moved editorial views, and the field kit. A site on the last 0.x already runs the 1.0 code, and what is left is packaging.
- **Give each of your own integrations a `createJobs`.** `throughline()` runs integrations through the jobs adapter, and refuses one without `createJobs`; `createFunctions` is optional in 1.0. The bundled webhook integration is the pattern: write the jobs once, and derive `createFunctions` from them, so 0.x keeps working while you switch.

  ```ts
  export const myIntegration: Integration = {
    // …
    createJobs: (getContext) => [syncJob(getContext)],
    createFunctions: (ctx) =>
      inngestJobs(ctx.inngest).functions(myIntegration.createJobs!(() => ctx)),
  }
  ```

## 1. Dependencies

Replace every `@forumone/throughline-*` dependency with the 1.0 packages:

```bash
pnpm remove @forumone/throughline-core @forumone/throughline-plugin-contract \
  @forumone/throughline-audit @forumone/throughline-approvals @forumone/throughline-publishing \
  @forumone/throughline-components @forumone/throughline-integrations @forumone/throughline-email \
  @forumone/throughline-workflows @forumone/throughline-design-contract \
  @forumone/throughline-design-system-payload
pnpm add @forumone/throughline @forumone/throughline-design-system
```

Then install the optional peers your site uses. `payload` is the only required one, and each of the rest is loaded only by the part of the suite that needs it:

| Install                                                    | If the site                                        |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `inngest`                                                  | runs jobs on Inngest (`/jobs/inngest`)             |
| `resend`, `@react-email/components`, `@react-email/render` | sends approval emails (`email` in `throughline()`) |
| `@vercel/blob`, `@payloadcms/plugin-cloud-storage`         | uses the Blob upload hardening in `/media`         |

`next`, `react`, `@payloadcms/ui` and `@payloadcms/next` are already in any Payload site. In 0.x, `resend` and React Email came with the email package, so a site that sends email needs to add them now. A missing one fails when its feature runs, with an error naming the package.

## 2. Imports

```bash
pnpm exec throughline migrate-imports --dry-run   # what it would change
pnpm exec throughline migrate-imports
```

It rewrites every import of a 0.x package to its 1.0 home. One import may become several, because each name goes to the subpath that now exports it. It keeps `type` and aliases, and it rewrites admin component paths, `importMap.js` included.

What it leaves alone it lists, with what to use instead, and it exits 1 until the list is empty. On a site that wired the suite by hand, expect exactly these, which steps 3 and 4 replace:

| Left                                                                   | Replaced by                               |
| ---------------------------------------------------------------------- | ----------------------------------------- |
| `createMcpToolCollector`                                               | `suite.mcpTools`                          |
| `getEmailFunctions`, `getIntegrationRegistry`, `getIntegrationContext` | `suite.jobs`                              |
| a `create…Function` factory                                            | the job of the same name, in `suite.jobs` |
| `getPluginRegistry`, `resolveAdminGroup`                               | `throughline()`                           |

## 3. `payload.config.ts`

The plugin calls, the hand-built collector and the constants they shared become one call:

```ts
import { mcpApiKeyAccess, throughline } from '@forumone/throughline'
import { inngestJobs } from '@forumone/throughline/jobs/inngest'

export const suite = throughline({
  jobs: inngestJobs(inngest),
  collections: CONTENT_COLLECTIONS,
  admin: { group: 'Workflow' },

  components: { manifest: { type: 'object', manifest }, matching: { strategy: 'tfidf' } },
  publishing: { seoField: SEO_GROUP, urls: revalidationUrlBuilders },
  approvals: { collectionSlug: APPROVALS_COLLECTION, groups, groupResolver },
  auditQuery: {},
  email: { resolveApprover, resolveRequester, tokens },
  integrations: { integrations: [myIntegration], admin: { group: 'Admin' } },
  references: { collections: [/* … */] },
  editorial: { health: { checks }, calendar, palette },
  healthcheck: { checks: [createPayloadReachableCheck()], schedule: '0 * * * *' },
})

export default buildConfig({
  // …
  plugins: [
    suite.plugin,
    mcpPlugin({
      mcp: { tools: suite.mcpTools },
      overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
    }),
    // the site's own and Payload's official plugins
  ],
})
```

How each 0.x option maps:

- **Each plugin's options move under its key, less what `throughline()` supplies:** `mcpTools`, `inngest`, `emit` and `logger`. A plugin is on when its key is present. Audit, job failures and `check_slug` are always on.
- **Shared values are given once.** `approvals.collectionSlug` reaches the approvals collection, the emails and the expiry job, so there is no separate `approvalsCollectionSlug` for email and no `collectionSlug` for the expiry job. `collections` replaces publishing's `collections` list (with `seoField` and `collectionOptions` for per-collection settings), "Your work"'s `work.collections`, and the scheduling jobs' `collections`.
- **What every site wrote by hand is the default.**
  - email's `buildActionUrl` signs links with approvals' `tokenSecret` or `APPROVAL_TOKEN_SECRET`, against `publicUrl` or `NEXT_PUBLIC_SERVER_URL`. Delete your own unless it does something else.
  - Scheduled publishes go through the publishing pipeline. Delete your `publishScheduled` unless it does something else, and pass it as `publishing.scheduling.publish` if it does.
  - A failing healthcheck is recorded in `job-failures`.
- **Job options move into the call:**
  - revalidation's `urlBuilders` becomes `publishing.urls`, and its other options `publishing.revalidation`;
  - the backstop's `schedule` and `overdueByMs` become `publishing.scheduling.backstop`;
  - expiry's become `approvals.expiry`;
  - the healthcheck's become `healthcheck`.
- **Delete any `approvalResolver` you passed publishing.** Approvals attaches a real one, and an explicit one overrides it: a stub returning `null` blocks every publish that needs approval.

`mcpPlugin` stays in your config, after `suite.plugin`, because the key collection's access is your policy.

## 4. The Inngest route

The function list you assembled by hand is `suite.jobs`:

```ts
import config, { suite } from '@/payload.config'

const payload = await getPayload({ config })
const jobs = inngestJobs(inngest, { onFailure: createTerminalFailureHandler({ payload }), payload })

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: registrableInngestFunctions([...jobs.functions(suite.jobs), ...yourOwnFunctions]),
})
```

`suite.jobs` holds every job the options call for:

- revalidation (given `publishing.urls`), scheduled publishing and its backstop, approval expiry and the audit echo;
- the healthcheck;
- the three approval emails;
- each integration's jobs.

Each registers under the id its 0.x factory did.

On Payload Jobs instead, there is no route: pass `payloadJobs()` as `jobs`, and `suite.plugin` registers the jobs itself.

## 5. Generated files

```bash
pnpm --dir apps/web generate:types
pnpm --dir apps/web generate:importmap
```

`importMap.js` changes, because every admin component now comes from `@forumone/throughline/client`, `/rsc` or `@forumone/throughline-design-system/client`. The codemod rewrote its paths, but its aliases are hashes of the old ones. `payload-types.ts` should not change; if it does, read the diff before going on.

## 6. Tests and checks

- A test that counts the MCP tools your site serves should still pass, if the same plugins are registered: they declare the same tools. A plugin that is always on in 1.0 and was not registered in 0.x adds its tools.
- A check that a package is imported from one place, such as `check:boundary` or `check:instances`, needs the new package names.

## 7. Schema: expect nothing

```bash
BLOB_READ_WRITE_TOKEN=placeholder pnpm --dir apps/web migrate:create upgrade-to-1-0
```

It should report no schema changes, and write nothing. Set a placeholder Blob token if you use the storage plugin, or its fields are missed and the comparison is wrong.

**If it proposes a change, find out why before keeping it.** The expected reason is a plugin that is always on in 1.0 and was not registered in 0.x (see "Always on"). Anything else means a field name drifted: fix the option rather than writing the migration, and say so in an issue.

## 8. Ship

- Run your full gates, and compare `.next/prerender-manifest.json` with `main`'s if you use Cache Components.
- Deploy a preview with a publish scheduled ten minutes out. It should publish on time, from the function it was scheduled with, since that function's id did not change.
- Merge, then promote. A rollback is promoting the previous commit, which is safe because step 7 changed no schema.

## Removed in 1.0

| 0.x                                                                                 | Instead                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `createRevalidateOnPublishFunction` and the eight other `create…Function` factories | the `…Job` of the same name, in `suite.jobs`, or through `inngestJobs(…).toFunction(job)` |
| `createMcpToolCollector`, `toPayloadMcpTool(s)`                                     | `throughline()`, `suite.mcpTools`                                                         |
| `getPluginRegistry`, `resolveAdminGroup`, `DEFAULT_ADMIN_GROUP`                     | `throughline()`, and its `admin` option                                                   |
| `getEmailFunctions`, `getIntegrationRegistry`, `getIntegrationContext`              | `suite.jobs`                                                                              |
| `APPROVALS_RESOLVER_SYMBOL`                                                         | nothing: approvals and publishing find each other                                         |
| `DEFAULT_AUDIT_COLLECTION_SLUG`, `DEFAULT_APPROVALS_COLLECTION_SLUG`                | `DEFAULT_AUDIT_SLUG`, `DEFAULT_APPROVALS_SLUG`: the same values                           |
| `@forumone/throughline-core/auth`                                                   | nothing: it pointed at a file nothing built                                               |
| `@forumone/throughline-forms`                                                       | stays on 0.x                                                                              |
| `@forumone/throughline-reference-ds`                                                | the scaffold's design system, which `create-throughline` writes into a new project        |

## Always on

`throughline()` always registers three plugins, because the rest depend on them or they cost nothing a site does not use:

- **Audit:** every other plugin requires the audit log.
- **Job failures:** the `job-failures` collection, where a job that ran out of retries is recorded, and its `list_job_failures` tool.
- **Fields:** the `check_slug` tool.

A 0.x site that registered all three sees no change. One that did not register `jobFailuresPlugin` gains the `job-failures` collection: step 7's migration, and one that is meant.

## Stricter in 1.0: edits to a live page

1.0 refuses two writes 0.x allowed, because each changed what the public sees without the pipeline:

- **A create with `_status: 'published'`.** Create a draft, then publish it.
- **A non-draft save that changes a live document.** Save a draft (`draft: true`), then publish it. The admin already works this way, so editors see no difference; what changes is code that calls `payload.update` on a live document without `draft: true`.

Find that code before you ship. For each one:

- **An editor's change, or a script fixing content:** write a draft and publish through the pipeline, or for a one-off script pass `context: { bypassPublishingServer: true }`, as seeds do.
- **Data derived from the page and written back** (an audio URL, a sync timestamp): pass `context: DERIVED_WRITE_CONTEXT` from `@forumone/throughline/publishing`.

A refused write is a 400 that says which of these it is.

## What does not change

- **Environment variables.** The same names, checked the same way: `assertEnvironment(approvalsEnv, emailEnv, …)`.
- **Collections, fields and their slugs.** Hence step 7.
- **Function ids and event names.** Hence the scheduled publish in step 8.
- **MCP tool names.**
