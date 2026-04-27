# Adding a collection

Goal: model a new publishable content type (let's say `programs`), wire it into the publishing pipeline, and have Claude able to draft and publish entries.

Time: ~30 minutes.

## 1. Define the collection

In `apps/web/src/payload.config.ts` (or a separate file imported into `collections`):

```typescript
import type { CollectionConfig } from 'payload'

const Programs: CollectionConfig = {
  slug: 'programs',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'summary', type: 'textarea', required: true },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [/* your blocks here, e.g. HeroBlock, MediaBlock, CTABlock */],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    // The policy group is what enables Throughline's approval/embargo gates.
    // Copy its shape from the example Pages collection.
    {
      name: 'policy',
      type: 'group',
      fields: [
        { name: 'requiresApproval', type: 'checkbox', defaultValue: false },
        {
          name: 'approverGroups',
          type: 'select',
          hasMany: true,
          options: ['editorial', 'legal', 'communications', 'senior'],
        },
        { name: 'embargoedUntil', type: 'date' },
      ],
    },
    { name: 'publishedAt', type: 'date' },
    { name: 'scheduledPublishAt', type: 'date' },
  ],
}
```

> [!NOTE]
> The `policy` group is what makes the collection "Throughline-aware." Without it, the publishing pipeline still works, but the approval and embargo gates have nothing to read. Copy this shape from the example `Pages` collection.

Add `Programs` to `collections` in `buildConfig`.

## 2. Wire publishing for the collection

```typescript
publishingPlugin({
  inngest,
  collections: [
    { slug: 'pages' },
    { slug: 'programs' }, // <-- add
  ],
  // ...
}),
```

This tells the Publishing plugin to:

- Install the `_status`-blocking hooks on `programs`
- Register the collection's `publish` / `unpublish` / `schedule_publish` MCP tools
- Wire the policy gates against this collection's `policy` group

## 3. Allow Payload MCP CRUD

The Payload MCP plugin (`@payloadcms/plugin-mcp`) opts collections in explicitly. To let Claude read/create/update programs:

```typescript
mcpPlugin({
  collections: {
    pages: { operations: { find: true, create: true, update: true } },
    programs: { operations: { find: true, create: true, update: true } }, // <-- add
  },
}),
```

`delete` is intentionally off by default; opt in only when you've thought through what "delete" means for your content.

## 4. Frontend rendering

Add a route at `apps/web/src/app/(frontend)/programs/[slug]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@/payload.config'

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'programs',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
    limit: 1,
  })
  const program = result.docs[0]
  if (!program) notFound()

  return (
    <main>
      <h1>{program.title}</h1>
      {/* render program.layout via your block renderer */}
    </main>
  )
}
```

If your blocks come from the reference DS, you already have a renderer to plug in. Otherwise build a small `<Blocks blocks={layout} />` that switches on each block's `blockType`.

## 5. Wire revalidation

The `createRevalidateOnPublishFunction` workflow needs to know how to compute paths to revalidate for this collection. By default it builds `/blog/:slug` for `posts`. For `programs`, override:

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  buildPaths: (event) => {
    if (event.data.collection === 'programs') {
      return [`/programs/${event.data.doc.slug}`, '/programs']
    }
    // fall back to default for other collections
    return undefined
  },
}),
```

Returning `undefined` defers to the default behavior. Returning an array overrides it.

## 6. Generate Payload types

```bash
pnpm --filter <your-web-app-package> payload generate:types
```

This rewrites `apps/web/src/payload-types.ts`. Use the generated `Program` type in your route.

## 7. Try it from Claude

```
Create a draft Program titled "Climate Resilience" with slug "climate-resilience"
and a one-paragraph summary about coastal cities.
```

Claude calls `programs.create` (or whatever the Payload MCP names the operation) with `_status: 'draft'`. You can verify in `/admin/collections/programs`.

```
Publish the climate-resilience program.
```

The publishing pipeline runs against the new collection. You'll see the same composition / accessibility / required-fields gates as you do for `pages`. If `policy.requiresApproval` is on, the approval flow kicks in.

## What you didn't have to do

- Tell the audit log about this collection (it auto-records)
- Tell the components plugin (composition validation reads the collection's blocks generically)
- Add a Forms-related anything (forms are their own collection)
- Edit any plugin's source

The seam is configuration. New collections compose against the existing plugins by listing themselves in three places: `collections`, `publishingPlugin.collections`, and the Payload MCP allowlist.
