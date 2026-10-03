import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { examplePlugin } from './example-plugin'
import { auditPlugin } from '@forumone/throughline/audit'
import { createMcpToolCollector, mcpApiKeyAccess } from '@forumone/throughline'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { componentsPlugin } from '@forumone/throughline/components'
import { getPublishingService, publishingPlugin } from '@forumone/throughline/publishing'
import { approvalsPlugin } from '@forumone/throughline/approvals'
import { auditQueryPlugin } from '@forumone/throughline/audit'
import { integrationsJobs, integrationsPlugin } from '@forumone/throughline/integrations'
import { auditEventEchoJob } from '@forumone/throughline/audit'
import { createPayloadReachableCheck, healthcheckJob } from '@forumone/throughline/integrations'
import { createTerminalFailureHandler, eventSenderFor } from '@forumone/throughline/jobs'
import {
  executeScheduledPublishesJob,
  publishAtScheduledTimeJob,
  revalidateOnPublishJob,
  type ScheduledPublishRequest,
} from '@forumone/throughline/publishing'
import { expireStaleApprovalsJob } from '@forumone/throughline/approvals'
import { payloadJobs } from '@forumone/throughline/jobs/payload'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import type { Manifest } from '@forumone/throughline-design-system/contract'
import type { Access, CollectionConfig, Config, Payload } from 'payload'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['admin'],
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Viewer', value: 'viewer' },
      ],
    },
  ],
}

const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    {
      name: 'policy',
      type: 'group',
      fields: [
        { name: 'requiresApproval', type: 'checkbox', defaultValue: false },
        { name: 'embargoedUntil', type: 'date' },
        { name: 'expiresAt', type: 'date' },
      ],
    },
    {
      name: 'layout',
      type: 'array',
      fields: [
        { name: 'blockType', type: 'text', required: true },
        { name: 'variant', type: 'text' },
      ],
    },
    { name: 'publishedAt', type: 'date', admin: { readOnly: true } },
    { name: 'scheduledPublishAt', type: 'date' },
  ],
  versions: { drafts: true },
}

/*
A person in `users` with the admin role. Checked by collection first: `req.user`
can be something other than a person, and only a person has roles.
*/
const isAdmin: Access = ({ req: { user } }) => {
  if (user?.collection !== Users.slug) return false
  const roles = (user as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('admin')
}

/** Where a page is served, for revalidation. The playground has no frontend. */
const urlBuilders = { pages: (slug: string) => `/${slug}` }

/** A scheduled publish goes through the publishing pipeline, in process, as on a real site. */
async function publishScheduled(
  { collection, id, reasoning }: ScheduledPublishRequest,
  { payload }: { payload: Payload },
) {
  const outcome = await getPublishingService(payload).publish({
    collection,
    id,
    actor: { apiKeyName: 'scheduled-publish', channel: 'mcp' },
    meta: { reasoning },
  })
  return { published: outcome.published, reason: outcome.reason }
}

export interface PlaygroundConfigOptions {
  db: Config['db']
  /**
   * Run the job queue every minute in-process. Off in tests, which drive the
   * queue themselves.
   */
  autoRun?: boolean
  /** Replaces Next's revalidation, which needs a request. */
  revalidate?: Parameters<typeof revalidateOnPublishJob>[0]['revalidate']
}

/**
 * The playground's whole config, less the database.
 *
 * **It runs on Payload Jobs, with no Inngest anywhere** (1.0 P1). Every
 * background job a Throughline site has — publish revalidation, scheduled
 * publishing and its backstop, approval expiry, the audit echo, the healthcheck,
 * the webhook integration — is a `defineJob` job registered with
 * `payloadJobs().plugin(...)`, and runs on Payload's own queue.
 *
 * The plugins that only announce events (audit, approvals, publishing) are
 * handed `eventSenderFor(jobs)` as their `inngest`, which sends through the
 * adapter. That is transitional: P3 gives them the adapter itself.
 *
 * Shared by `payload.config.ts` (Postgres, for `pnpm dev`) and the end-to-end
 * test (SQLite in memory), so the test boots the configuration the playground
 * runs rather than a copy of it.
 */
export function playgroundConfig(options: PlaygroundConfigOptions): Config {
  const jobs = payloadJobs({ onFailure: createTerminalFailureHandler() })
  const events = eventSenderFor(jobs)

  /*
  Where every server puts its tools for `mcpPlugin`.

  Each plugin declares its tools' names and descriptions as the config is built,
  and binds the handlers at `onInit` — which is the earliest they can exist,
  since each closes over `payload`, the publishing service or the manifest
  loader. The plugin reads this array at both moments: once at config time to
  generate a per-key checkbox per tool, and again per request to serve them.

  Handed over as `mcpTools.tools`, the array itself. A spread or a `.slice()`
  here would hand over something nobody fills.
  */
  const mcpTools = createMcpToolCollector()
  const scheduled = [{ slug: Pages.slug }]

  return {
    admin: {
      importMap: {
        baseDir: path.resolve(__dirname, 'app/(payload)/admin'),
      },
      user: Users.slug,
    },
    /*
    No key collection of its own. `mcpPlugin` below brings
    `payload-mcp-api-keys` and serves every plugin's tools on one `/api/mcp`. It
    is exact-pinned to the Payload version this app runs — `3.90.2`, not a range
    — because two Payloads in one graph makes `Block` not assignable to `Block`.
    */
    collections: [Users, Pages],
    db: options.db,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET ?? 'dev-secret-change-me',
    typescript: {
      outputFile: path.resolve(__dirname, 'payload-types.ts'),
    },
    jobs: {
      // Every minute, in-process, as a long-lived dev server can. A serverless
      // host calls /api/payload-jobs/run and /api/payload-jobs/handle-schedules
      // from its scheduler instead.
      ...(options.autoRun === false
        ? {}
        : { autoRun: [{ cron: '* * * * *', queue: 'throughline' }] }),
    },
    /*
    Order is load-bearing twice over.

    `auditPlugin` first: every other Throughline plugin requires the
    `audit-log` capability at init and refuses to load without it.

    And every tool-bearing server before `mcpPlugin`. Each declares its tools'
    names and descriptions as the config is built — which is when `mcpPlugin`
    reads the array, to generate one per-key checkbox per tool — and binds the
    handlers at `onInit`. A server registered *after* `mcpPlugin` declares into
    an array that has already been read, so its tools get no checkbox and are
    then denied to every key with no error anywhere.
    */
    plugins: [
      auditPlugin({ inngest: events }),
      componentsPlugin({
        // Cast through `unknown`: the JSON literal type is structurally
        // compatible but TS won't widen tuple types like `placement` from
        // `string[]` to `["page" | "section" | "inline", ...]` automatically.
        // The plugin's Zod schema validates the shape at load time anyway.
        manifest: { type: 'object', manifest: referenceManifest as unknown as Manifest },
        matching: { strategy: 'tfidf' },
        mcpTools,
      }),
      approvalsPlugin({
        inngest: events,
        groups: [
          { slug: 'editorial', name: 'Editorial review' },
          { slug: 'legal', name: 'Legal review' },
        ],
        // Stub resolver for the playground — replace with a real lookup once
        // the playground gains a `groups` field on Users.
        groupResolver: { resolveUsers: async () => [] },
        tokenSecret:
          process.env.APPROVAL_TOKEN_SECRET ??
          'playground-approval-secret-change-me-change-me-change',
        mcpTools,
      }),
      publishingPlugin({
        inngest: events,
        collections: [{ slug: Pages.slug }],
        mcpTools,
      }),
      auditQueryPlugin({ mcpTools }),
      integrationsPlugin({ emit: jobs.emit, mcpTools }),
      examplePlugin({ greeting: 'Hello from the playground' }),

      /*
      Every job, declared before Payload exists: none of these is given
      `payload`, and each finds it on its context when it runs.
      */
      jobs.plugin([
        revalidateOnPublishJob({
          urlBuilders,
          ...(options.revalidate ? { revalidate: options.revalidate } : {}),
        }),
        publishAtScheduledTimeJob({ collections: scheduled, publish: publishScheduled }),
        executeScheduledPublishesJob({ collections: scheduled, publish: publishScheduled }),
        expireStaleApprovalsJob({}),
        auditEventEchoJob({}),
        healthcheckJob({ checks: [createPayloadReachableCheck()] }),
        ...integrationsJobs(),
      ]),

      /*
      Last of the tool-bearing chain, and handed the collector's array itself
      rather than a copy: it reads `mcp.tools` per request, and the servers
      above fill that array at `onInit`.

      The key collection is admin-only: a key runs every tool as the person it
      is bound to, so minting, reading and revoking one is an admin's call.
      `mcpApiKeyAccess` also refuses a key principal outright.
      */
      mcpPlugin({
        mcp: { tools: mcpTools.tools },
        overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
      }),
    ],
  }
}
