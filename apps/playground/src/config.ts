import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mcpApiKeyAccess, throughline } from '@forumone/throughline'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { createPayloadReachableCheck } from '@forumone/throughline/integrations'
import { createTerminalFailureHandler } from '@forumone/throughline/jobs'
import { payloadJobs } from '@forumone/throughline/jobs/payload'
import type { revalidateOnPublishJob } from '@forumone/throughline/publishing'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import type { Manifest } from '@forumone/throughline-design-system/contract'
import type { Access, CollectionConfig, Config } from 'payload'

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
 * **One `throughline()` call, on Payload Jobs, with no Inngest anywhere.** The
 * call registers every plugin in order, gives each the one MCP collector, sends
 * the plugins' events through the jobs adapter, and, because the adapter is
 * Payload Jobs, registers every job the options call for: publish
 * revalidation, scheduled publishing and its backstop, approval expiry, the
 * audit echo, the healthcheck and the webhook integration.
 *
 * Shared by `payload.config.ts` (Postgres, for `pnpm dev`) and the end-to-end
 * test (SQLite in memory), so the test boots the configuration the playground
 * runs rather than a copy of it.
 */
export function playgroundConfig(options: PlaygroundConfigOptions): Config {
  const suite = throughline({
    jobs: payloadJobs({ onFailure: createTerminalFailureHandler() }),
    collections: [Pages.slug],
    components: {
      // Cast through `unknown`: the JSON literal type is structurally
      // compatible but TS won't widen tuple types like `placement` from
      // `string[]` to `["page" | "section" | "inline", ...]` automatically.
      // The plugin's Zod schema validates the shape at load time anyway.
      manifest: { type: 'object', manifest: referenceManifest as unknown as Manifest },
      matching: { strategy: 'tfidf' },
    },
    publishing: {
      urls: urlBuilders,
      ...(options.revalidate ? { revalidation: { revalidate: options.revalidate } } : {}),
    },
    approvals: {
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
    },
    auditQuery: {},
    integrations: {},
    healthcheck: { checks: [createPayloadReachableCheck()] },
  })

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
    The suite first, then `mcpPlugin`, which serves the tools the suite's
    plugins declare. Handed the array itself, not a copy: it reads `mcp.tools`
    per request, and the suite's plugins fill it at `onInit`.

    The key collection is admin-only: a key runs every tool as the person it is
    bound to, so minting, reading and revoking one is an admin's call.
    `mcpApiKeyAccess` also refuses a key principal outright.
    */
    plugins: [
      suite.plugin,
      mcpPlugin({
        mcp: { tools: suite.mcpTools },
        overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
      }),
    ],
  }
}
