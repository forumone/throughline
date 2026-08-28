import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { examplePlugin } from './example-plugin'
import { auditPlugin, createInngestClient, createMcpToolCollector } from '@forumone/throughline-core'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { componentsPlugin } from '@forumone/throughline-components'
import { publishingPlugin } from '@forumone/throughline-publishing'
import { approvalsPlugin } from '@forumone/throughline-approvals'
import { auditQueryPlugin } from '@forumone/throughline-audit'
import { integrationsPlugin } from '@forumone/throughline-integrations'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import type { Manifest } from '@forumone/throughline-design-contract'
import { buildConfig } from 'payload'
import type { CollectionConfig } from 'payload'

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

const inngest = createInngestClient({
  id: 'throughline-playground',
  isDev: process.env.NODE_ENV !== 'production',
})

/*
Where every server puts its tools for `mcpPlugin`.

Each plugin declares its tools' names and descriptions as the config is built,
and binds the handlers at `onInit` — which is the earliest they can exist, since
each closes over `payload`, the publishing service or the manifest loader. The
plugin reads this array at both moments: once at config time to generate a
per-key checkbox per tool, and again per request to serve them.

Handed over as `mcpTools.tools`, the array itself. A spread or a `.slice()` here
would hand over something nobody fills.
*/
const mcpTools = createMcpToolCollector()

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(__dirname, 'app/(payload)/admin'),
    },
    user: Users.slug,
  },
  /*
  No key collection of its own. This suite used to mint and store MCP keys for
  the six per-server endpoints; both are gone, and `@payloadcms/plugin-mcp`
  owns keys now.

  `mcpPlugin` below brings `payload-mcp-api-keys` and serves every plugin's
  tools on one `/api/mcp`. It is exact-pinned to the Payload version this app
  runs — `3.83.0`, not a range — because two Payloads in one graph makes `Block`
  not assignable to `Block`.
  */
  collections: [Users, Pages],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI ?? '',
    },
  }),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? 'dev-secret-change-me',
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
  /*
  Order is load-bearing twice over.

  `auditPlugin` first: every other Throughline plugin requires the `audit-log`
  capability at init and refuses to load without it.

  And every tool-bearing server before `mcpPlugin`. Each declares its tools'
  names and descriptions as the config is built — which is when `mcpPlugin`
  reads the array, to generate one per-key checkbox per tool — and binds the
  handlers at `onInit`. A server registered *after* `mcpPlugin` declares into an
  array that has already been read, so its tools get no checkbox and are then
  denied to every key with no error anywhere.
  */
  plugins: [
    auditPlugin({ inngest }),
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
      inngest,
      groups: [
        { slug: 'editorial', name: 'Editorial review' },
        { slug: 'legal', name: 'Legal review' },
      ],
      // Stub resolver for the playground — replace with a real lookup once
      // the playground gains a `groups` field on Users.
      groupResolver: { resolveUsers: async () => [] },
      tokenSecret:
        process.env.APPROVAL_TOKEN_SECRET ?? 'playground-approval-secret-change-me-change-me-change',
      mcpTools,
    }),
    publishingPlugin({
      inngest,
      collections: [{ slug: Pages.slug }],
      mcpTools,
    }),
    auditQueryPlugin({ mcpTools }),
    integrationsPlugin({ inngest, mcpTools }),
    examplePlugin({ greeting: 'Hello from the playground' }),

    /*
    Last of the tool-bearing chain, and handed the collector's array itself
    rather than a copy: it reads `mcp.tools` per request, and the servers above
    fill that array at `onInit`.
    */
    mcpPlugin({ mcp: { tools: mcpTools.tools } }),
  ],
})
