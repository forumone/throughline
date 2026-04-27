# Migrating content

Goal: bring an existing site's content into Throughline without losing URLs, SEO equity, or editorial history.

## Choose an approach

| Approach | When it fits |
| --- | --- |
| **API-to-API** | Your old CMS has a clean export API and you want a one-time bulk move. |
| **CSV / structured export** | Mid-size sites; the import is a one-off; you want to clean data en route. |
| **Local API script** | Anything custom — incremental imports, transformations, conditional skips, dry-run iterations. |
| **Side-by-side period** | Risk-averse; old and new run together while content's audited. |

For most clients the practical answer is "Local API script with a CSV input." That gives you scriptable transformations and a paper trail of what got loaded.

## Pattern: Local API import script

Write the script in your project's repo, not in core. It uses Payload's local API directly:

```typescript
// scripts/import-pages.ts
import { getPayload } from 'payload'
import config from '../apps/web/src/payload.config'
import { readFile } from 'node:fs/promises'

interface SourceRow {
  oldUrl: string
  title: string
  body: string
  publishedAt: string
  metaDescription: string
}

const main = async () => {
  const payload = await getPayload({ config })

  const csv = await readFile('./migration/pages.csv', 'utf-8')
  const rows = parseCsv(csv) as SourceRow[]

  for (const row of rows) {
    const slug = sluggify(row.oldUrl)

    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: slug } },
      limit: 1,
    })
    if (existing.docs[0]) {
      console.log(`skip (exists): ${slug}`)
      continue
    }

    const doc = await payload.create({
      collection: 'pages',
      data: {
        title: row.title,
        slug,
        layout: convertHtmlToBlocks(row.body),
        seo: { description: row.metaDescription },
        publishedAt: new Date(row.publishedAt),
      },
      // bypass access controls; you're running as a script, not on behalf of a user
      overrideAccess: true,
      // mark as already-published — skip the publish pipeline for migrated content
      // ONLY if the source is trusted; otherwise let the pipeline run
      // _status: 'published',
    })

    // Write a redirect from the old URL
    await payload.create({
      collection: 'redirects',
      data: { from: row.oldUrl, to: `/${slug}`, type: 'permanent' },
      overrideAccess: true,
    })

    console.log(`imported: ${slug}`)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

Run with:

```bash
pnpm tsx scripts/import-pages.ts
```

(Or `node --experimental-strip-types scripts/import-pages.ts` if you've configured a stripper.)

## Should imports run through the publish pipeline?

Two valid answers.

**Yes, run through the pipeline.** Migrated content is treated like any new content. The pipeline catches missing alt text, missing SEO descriptions, broken links — all the things you probably want to fix anyway. Pro: your migrated content has the same quality bar as your future content. Con: every page that fails a gate stops the migration; you spend time fixing data the script can't.

**No, bypass for the bulk import.** Set `_status: 'published'` directly via `overrideAccess: true`. Pro: fast; one-shot. Con: migrated content lives in `_status: 'published'` without ever having proven it satisfies your policy gates. The first time someone *edits* a migrated page, the publish pipeline runs and may reject things that were already shipped.

The honest middle ground: **bypass for the bulk import, then run a one-off audit script that calls `publishingPlugin.checkPipeline(collection, id)` on every imported document and reports failures.** That gives you a list of pages to fix before they're touched in normal editing. The framework doesn't ship `checkPipeline` as a public method yet, but you can build the equivalent by reading each document and calling each accessibility check directly.

## Preserve URLs

The single most-important thing to preserve in any CMS migration is URL structure. Search-engine ranking depends on it. Two options:

1. **Keep the same URL paths.** Your slugs and routing match the old site one-for-one. Sometimes possible, sometimes not (CMS-X used `/article-12345`, you want `/blog/post-name`).
2. **Add redirects.** The example script above writes to a `redirects` collection. Wire that collection's data to a Next.js middleware:

```typescript
// apps/web/src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

const cache = new Map<string, string>()

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (cache.has(path)) {
    return NextResponse.redirect(new URL(cache.get(path)!, req.url), 301)
  }
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'redirects',
    where: { from: { equals: path } },
    limit: 1,
  })
  const target = result.docs[0]?.to
  if (target) {
    cache.set(path, target)
    return NextResponse.redirect(new URL(target, req.url), 301)
  }
  return NextResponse.next()
}
```

Use `301` for permanent moves so search engines transfer link equity.

## Convert HTML to blocks

If your old CMS stored content as raw HTML and your new collection uses block-based layouts, the conversion is real work. Options:

- **HTML to Lexical**: Payload's Lexical editor accepts a JSON representation. Use a parser like `@payloadcms/richtext-lexical/converters/html` to convert HTML → Lexical JSON.
- **HTML to blocks**: write a parser that recognizes structural patterns (e.g., `<h2>` followed by `<p>` becomes a SectionIntro block). Lossy, but produces real composition.
- **Single-block fallback**: dump the HTML into a single `Prose` block. Loses semantic structure but is one-line to implement; iterate later.

Most clients start with the fallback and iterate. The constraint is whether your design system has a `Prose` (or similar) block that accepts arbitrary HTML — see [the reference DS Prose component](../../packages/reference-ds/src/components/Prose/Prose.tsx) for the shape.

## Preserve `publishedAt` for SEO and ordering

Don't backfill `publishedAt` to "now" on import. Use the source's actual publish dates. Search engines and your own date-ordered indexes (blog archives, RSS feeds) depend on it.

If a source row doesn't have a publish date, fall back to `createdAt`, then to a fixed historical date — *not* the import time.

## Side-by-side period

For high-traffic sites, run the old and new system in parallel for a week or two. The pattern:

- Migrate content into Throughline, leave it unpublished
- Pick one URL path (`/news/*`) and route it to the new system at the CDN/load balancer
- Watch the audit log for unexpected behavior
- Expand the routed path until 100% is on Throughline
- Decommission the old system

The framework doesn't help with this directly — it's a deployment/routing concern — but everything Throughline does is per-URL, so the pattern composes cleanly.

## What you usually forget

- **Authors / created-by**: if you care about authorship, migrate users first and assign each page's `author` field via a name-to-ID map.
- **Tags / taxonomy**: if pages are tagged, migrate the tag taxonomy into a `tags` collection before pages.
- **Embedded media**: rewrite image URLs from old-CMS-specific paths to your new media paths. The Payload media collection's `filename` and `url` fields are what your blocks reference.
- **Comments / engagement**: rarely migrated, often expected to be. Set expectations early.
- **Drafts / unpublished work**: decide whether to migrate. Often easier to skip and let editors recreate.

## When *not* to migrate

If the old site is being entirely rebuilt — new IA, new content, new design — don't migrate. Start fresh in Throughline. Sites that have evolved organically for 10 years often benefit more from "rewrite the 200 pages that matter" than from "import the 5,000 pages that exist." The migration cost can exceed the rewrite cost.

A useful audit: have a human read a random 50-page sample. If most of them require editing anyway, migration is mostly compute that produces a worse starting point than a rewrite. If most are still good, migration is worth it.
