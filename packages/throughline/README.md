# @forumone/throughline

Throughline for Payload CMS: publishing behind a policy pipeline, approvals, the audit log, editorial
reports, integrations, email and background jobs, with every feature reachable over MCP. One call
registers the suite; each part also lives on its own subpath.

> **Coming from 0.x?** This package is core, plugin-contract, publishing, workflows, audit,
> approvals, components, integrations and email together.
> [Upgrading from 0.x](https://github.com/forumone/throughline/blob/main/docs/guides/upgrading.md) moves a 0.x site onto it, with a codemod for the imports.

**Reference: [`docs/reference/throughline.md`](https://github.com/forumone/throughline/blob/main/docs/reference/throughline.md)**, with a page per plugin.

## What's inside

| Subpath           | Holds                                                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (root)            | `assertEnvironment`, `checkEnvValue`, `hardenCoreCollections`, `mcpApiKeyAccess`, `withMeta`, `auditContext`, the logger, utilities, and the plugin types                                                                                                                                |
| `/publishing`     | `publishingPlugin`, the publishing service, `isDraftWrite`, the accessibility checks, and the revalidation and scheduled-publishing jobs; see [publishing](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/publishing.md)                                   |
| `/editorial`      | `editorialPlugin`: content health, the content calendar, "Your work", command palette search, and their MCP tools                                                                                                                                                                        |
| `/approvals`      | `approvalsPlugin`, signed action links, `expireStaleApprovalsJob`; see [approvals](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/approvals.md)                                                                                                            |
| `/audit`          | `auditPlugin`, `getAuditWriter`, `AUDIT_ACTIONS`, `auditQueryPlugin` and its tools, `auditEventEchoJob`; see [audit](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/audit.md)                                                                              |
| `/components`     | `componentsPlugin`: the design-system manifest over MCP; see [components](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/components.md)                                                                                                                    |
| `/integrations`   | `integrationsPlugin`, the registry, the webhook integration, manual sync, `healthcheckJob`; see [integrations](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/integrations.md)                                                                             |
| `/email`          | `emailPlugin`, the Resend client, the approval notifications and their templates; see [email](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/email.md)                                                                                                     |
| `/jobs`           | `defineJob`, the job types, the failure handlers, and `CoreEvents` for module augmentation; see [jobs](https://github.com/forumone/throughline/blob/main/docs/reference/throughline/jobs.md)                                                                                             |
| `/jobs/inngest`   | `inngestJobs`, `createInngestClient`, `resolveInngestEnv`, `registrableInngestFunctions`                                                                                                                                                                                                 |
| `/jobs/payload`   | `payloadJobs`                                                                                                                                                                                                                                                                            |
| `/media`          | Blob client-upload hardening, and reference tracking: `referencesPlugin`, `findReferences`, the delete and trash guards                                                                                                                                                                  |
| `/fields`         | The field kit: `slugField`, `publishingFields`, `revisedAtField`, `unlistedField`, `characterCountPlugin`, `fieldsPlugin`                                                                                                                                                                |
| `/observability`  | `jobFailuresPlugin`, `getJobFailureWriter`, `createErrorReporter`, `reportError`, `buildRequestErrorReport`                                                                                                                                                                              |
| `/testing`        | `describeAnonymousAccess`, `checkAnonymousAccess`: test helpers for a site                                                                                                                                                                                                               |
| `/cache-tags`     | `createCacheTags`, which imports nothing, for front-end readers                                                                                                                                                                                                                          |
| `/client`, `/rsc` | The admin's client and server components, named in Payload's import map                                                                                                                                                                                                                  |
| bin               | `throughline migrate-imports`, see [Upgrading from 0.x](https://github.com/forumone/throughline/blob/main/docs/guides/upgrading.md); `throughline-payload`, see [the reference](https://github.com/forumone/throughline/blob/main/docs/reference/throughline.md#throughline-payload-bin) |

## `throughline()`

```ts
// payload.config.ts
import { mcpApiKeyAccess, throughline } from '@forumone/throughline'
import { inngestJobs } from '@forumone/throughline/jobs/inngest'

export const suite = throughline({
  jobs: inngestJobs(inngest), // or payloadJobs() from /jobs/payload
  collections: ['pages', 'posts'],
  publishing: { urls: { pages: (slug) => `/${slug}`, posts: (slug) => `/blog/${slug}` } },
  approvals: { groups, groupResolver },
  email: { resolveApprover, resolveRequester },
  integrations: {},
  healthcheck: { checks: [createPayloadReachableCheck()] },
})

export default buildConfig({
  // …
  plugins: [
    suite.plugin,
    mcpPlugin({
      mcp: { tools: suite.mcpTools },
      overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
    }),
  ],
})
```

```ts
// app/api/inngest/route.ts, on Inngest. On Payload Jobs, suite.plugin registers the jobs itself.
const jobs = inngestJobs(inngest, { onFailure: createTerminalFailureHandler({ payload }), payload })
export const { GET, POST, PUT } = serve({ client: inngest, functions: jobs.functions(suite.jobs) })
```

- **It registers every plugin in the order they need.** Audit, job failures and `check_slug` are always on. Every other plugin is on when its key is present.
- **It gives every plugin the one MCP collector.** `suite.mcpTools` is what `mcpPlugin` serves.
- **Shared values are given once.** `approvals.collectionSlug` reaches the approvals collection, the emails and the expiry job. `collections` reaches publishing, "Your work" and scheduled publishing. `admin` is every added collection's sidebar group, unless a plugin's own says otherwise.
- **`suite.jobs` is every job the options call for:** revalidation (given `publishing.urls`), scheduled publishing and its backstop, approval expiry, the audit echo, the healthcheck, the three approval emails, and each integration's jobs. Function ids are the ones the 0.x factories registered.
- **Its defaults are what every site wrote by hand.** Scheduled publishes go through the publishing pipeline. Approval links are signed with `APPROVAL_TOKEN_SECRET` against `NEXT_PUBLIC_SERVER_URL`. A failing healthcheck is recorded in `job-failures`.

The reasoning is in [`1.0-throughline-call.md`](https://github.com/forumone/throughline/blob/main/docs/spec/1.0-throughline-call.md). Each plugin is still exported from its subpath for a site that wires them by hand.

## Installation

```bash
pnpm add @forumone/throughline
```

`payload@^3.89.0` is the one required peer. The rest are optional, each needed only by the subpaths that use it, and none is loaded by the root:

| Install                                                             | When the site uses                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `inngest`                                                           | `/jobs/inngest`: jobs on Inngest                                                                                         |
| `resend`, `@react-email/components`, `@react-email/render`, `react` | `/email`, or `email` in `throughline()`. Loaded when an email is sent, so a missing one says so then, naming the package |
| `next`, `react`, `@payloadcms/ui`, `@payloadcms/next`               | `/client` and `/rsc`, which Payload's admin imports                                                                      |
| `@vercel/blob`, `@payloadcms/plugin-cloud-storage`                  | `/media`'s client-upload hardening                                                                                       |
| `vitest`                                                            | `/testing`                                                                                                               |

`src/peers.test.ts` checks the table: a static import that would load an optional peer from somewhere else fails it.

Every option, the jobs `suite.jobs` holds, the audit log, MCP authentication, the environment check and the `throughline-payload` bin are in [the reference](https://github.com/forumone/throughline/blob/main/docs/reference/throughline.md).
