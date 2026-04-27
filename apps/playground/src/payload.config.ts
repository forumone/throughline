import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { examplePlugin } from '@forumone/throughline-plugin-contract'
import { auditPlugin, createApiKeysCollection, createInngestClient } from '@forumone/throughline-core'
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

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(__dirname, 'app/(payload)/admin'),
    },
    user: Users.slug,
  },
  collections: [Users, Pages, createApiKeysCollection({ usersSlug: 'users' })],
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
  plugins: [
    auditPlugin({ inngest }),
    componentsPlugin({
      // Cast through `unknown`: the JSON literal type is structurally
      // compatible but TS won't widen tuple types like `placement` from
      // `string[]` to `["page" | "section" | "inline", ...]` automatically.
      // The plugin's Zod schema validates the shape at load time anyway.
      manifest: { type: 'object', manifest: referenceManifest as unknown as Manifest },
      matching: { strategy: 'tfidf' },
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
    }),
    publishingPlugin({
      inngest,
      collections: [{ slug: Pages.slug }],
    }),
    auditQueryPlugin({}),
    integrationsPlugin({ inngest }),
    examplePlugin({ greeting: 'Hello from the playground' }),
  ],
})
