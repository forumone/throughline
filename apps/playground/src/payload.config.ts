import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { examplePlugin } from '@forumone/throughline-plugin-contract'
import { auditPlugin, createApiKeysCollection, createInngestClient } from '@forumone/throughline-core'
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
    { name: 'body', type: 'richText' },
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
    examplePlugin({ greeting: 'Hello from the playground' }),
  ],
})
