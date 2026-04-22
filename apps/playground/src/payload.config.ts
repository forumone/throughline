import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { examplePlugin } from '@forumone/throughline-plugin-contract'
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
  fields: [],
}

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(__dirname, 'app/(payload)/admin'),
    },
    user: Users.slug,
  },
  collections: [Users],
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
  plugins: [examplePlugin({ greeting: 'Hello from the playground' })],
})
