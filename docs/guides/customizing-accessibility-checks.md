# Customizing accessibility checks

The third step of the publish pipeline runs every `AccessibilityCheck`: three built-ins, then the site's own. Each gets the document being published and returns a list of issues. An issue with severity `error` blocks the publish. This guide covers writing one, and switching a built-in off.

## What "accessibility" means here

The framework calls them "accessibility checks," but the pattern is general — anything you want to enforce _at publish time, with a structured rejection_, fits. Common uses:

- **Real accessibility**: image alt text, heading hierarchy, link labels
- **SEO**: meta description present, canonical URL set, Open Graph tags valid
- **Editorial**: brand voice (no banned phrases, required disclaimers, length caps)
- **Legal**: required cookie/consent language on certain page types
- **Operational**: link-checking against your own URLs, embedded asset existence

If a check could be a Payload field validator on a single field, prefer that: it runs at save time, not only at publish. A field that must merely be present is `requiredFields` on the collection, not a check. Use `AccessibilityCheck` when the rule looks across the whole document.

## The interface

```typescript
import type {
  AccessibilityCheck,
  AccessibilityIssue,
  ResolvedCollection,
} from '@forumone/throughline/publishing'

interface AccessibilityCheck {
  name: string
  run: (
    doc: Record<string, unknown>,
    collection: ResolvedCollection,
  ) => Promise<AccessibilityIssue[]> | AccessibilityIssue[]
}

interface AccessibilityIssue {
  field?: string // a path into the document, such as 'layout[2].image'
  message: string
  severity: 'error' | 'warning'
}
```

`doc` is the document as the pipeline loaded it. `collection` is the collection's publishing settings with every default filled in — its `slug`, and the names of its `layoutField`, `seoField`, `policyField` and so on — so a check can read the right field on a collection that renamed one, and return early on a collection it does not apply to.

An empty list passes.

## The built-ins

| Name                | What it fails                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `alt-text`          | an image-shaped object (a `url` or `filename`, and an `image/` MIME type if any) with no alt |
| `heading-hierarchy` | more than one Hero block, each of which renders an `h1`                                      |
| `link-labels`       | an object with a non-empty `url` and an empty `label`                                        |

They are heuristics over the document's shape, and a site whose content trips one wrongly can switch it off and supply its own:

```typescript
throughline({
  // …
  publishing: {
    disableAccessibilityChecks: ['alt-text'],
    accessibilityChecks: [myAltTextCheck],
  },
})
```

## Example: SEO description

```typescript
import type { AccessibilityCheck } from '@forumone/throughline/publishing'

export const requireSeoDescription: AccessibilityCheck = {
  name: 'seo-description',
  run(doc, collection) {
    const seo = doc[collection.seoField] as { description?: string } | undefined
    const description = seo?.description?.trim() ?? ''
    if (description === '') {
      return [
        {
          field: `${collection.seoField}.description`,
          message:
            'The SEO description is empty. Set a one- or two-sentence summary; it appears in search results.',
          severity: 'error',
        },
      ]
    }
    return []
  },
}
```

Register it under `publishing` in `throughline()`, as above. Checks run in the order listed, after the built-ins, and every check runs: the step collects all their issues before deciding, so an author sees every problem at once rather than one per attempt.

When a publish fails here, the result says where and why:

```json
{
  "published": false,
  "failedAt": "accessibility",
  "code": "accessibility-errors",
  "reason": "1 thing to fix so everyone can use this page.",
  "issues": [
    {
      "field": "seo.description",
      "where": "SEO › Description",
      "message": "The SEO description is empty. Set a one- or two-sentence summary; it appears in search results.",
      "severity": "error",
      "rule": "seo-description"
    }
  ]
}
```

`rule` is the check's `name`. Claude reads `issues` and fixes them before retrying, and an editor reads them in the admin's notification, so write `message` as the fix, not only the fault, in the editor's terms.

Report `field` as a path into the document, and leave the place out of `message`: the pipeline adds `where`, the path as the edit view labels it (`Block 3 (Image Hero) › Image`), from the collection's own config, and the admin prints it before the message. A check that names its own place says it twice.

A check also receives a third argument, `context`, with the design system's components by name when the components plugin is registered — so it can ask what a block is (`context.components?.[blockType]?.category`) rather than guess from its type. The built-in `heading-hierarchy` check counts heroes that way.

## Warnings

`severity: 'warning'` does not block. Each one reaches the publish result's `warnings`, as one line named by its check — `seo-length: Over 160 characters (seo.description)` — and the publishing service logs them. Claude relays them from the `publish` tool, and the admin's Publish button shows them in a toast. Nothing records them, so a rule that needs to be acted on later belongs in a content-health check (`/editorial`), which lists documents needing attention.

## Example: external links

```typescript
export const requireWorkingLinks: AccessibilityCheck = {
  name: 'working-links',
  async run(doc) {
    const results = await Promise.allSettled(
      extractExternalLinks(doc).map(async (url) => {
        const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        if (!r.ok && r.status !== 405) throw new Error(`${url} (${r.status})`)
      }),
    )
    return results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => ({
        message: `Broken link: ${String(r.reason?.message ?? r.reason)}`,
        severity: 'error' as const,
      }))
  },
}
```

Three notes on this one:

- **It calls the network.** The pipeline can do that, but every external check makes publish slower. Consider a job that runs _after_ publish, subscribed to `content/page.published`, instead of a gate.
- **It can be flaky.** A transient network failure fails the publish.
- **It is parallel.** A page with 50 external links would otherwise make 50 sequential requests inside one publish call.

## Testing checks

A check is a function of a document. Test it like one:

```typescript
import { describe, expect, it } from 'vitest'
import { requireSeoDescription } from './checks/seo-description'

const collection = { slug: 'pages', seoField: 'seo' } as Parameters<
  typeof requireSeoDescription.run
>[1]

describe('requireSeoDescription', () => {
  it('passes a document with a description', async () => {
    expect(
      await requireSeoDescription.run({ seo: { description: 'About us.' } }, collection),
    ).toEqual([])
  })

  it('fails an empty one, naming the field', async () => {
    const [issue] = await requireSeoDescription.run({ seo: { description: ' ' } }, collection)
    expect(issue).toMatchObject({ field: 'seo.description', severity: 'error' })
  })
})
```

## Where to look in code

- `packages/throughline/src/publishing/options.ts` — `AccessibilityCheck`, `AccessibilityIssue` and the options
- `packages/throughline/src/publishing/pipeline/steps/accessibility.ts` — how checks get invoked
- `packages/throughline/src/publishing/checks/` — the three built-ins, each with its tests
