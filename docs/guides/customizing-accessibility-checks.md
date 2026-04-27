# Customizing accessibility checks

Stage 3 of the publish pipeline runs registered `AccessibilityCheck` functions. Each gets the document being published and returns a structured result. Failures block publish; warnings are reported but don't gate. This guide covers writing one.

## What "accessibility" means here

The framework calls them "accessibility checks," but the pattern is general — anything you want to enforce *at publish time, with a structured rejection*, fits. Common uses:

- **Real accessibility**: image alt text, heading hierarchy, color contrast hints
- **SEO**: meta description present, canonical URL set, Open Graph tags valid
- **Editorial**: brand voice (no banned phrases, required disclaimers, length caps)
- **Legal**: required cookie/consent language on certain page types
- **Operational**: link-checking against your own URLs, embedded asset existence

If a check could be a Zod refinement on a single field, prefer that. Use `AccessibilityCheck` when the rule requires looking across multiple fields, calling external services, or needing structured failure metadata.

## The interface

```typescript
import type { AccessibilityCheck, CheckResult } from '@forumone/throughline-publishing'

interface AccessibilityCheck {
  name: string
  description: string
  check: (input: CheckInput) => Promise<CheckResult>
  appliesToCollections?: string[] // optional; default: all collections
}

interface CheckInput {
  collection: string
  doc: unknown                    // the document being published
  payload: Payload                // for cross-document queries
}

type CheckResult =
  | { status: 'pass' }
  | { status: 'warn'; message: string; details?: Record<string, unknown> }
  | { status: 'fail'; message: string; remedy?: string; details?: Record<string, unknown> }
```

## Example: image alt text

```typescript
import type { AccessibilityCheck } from '@forumone/throughline-publishing'

export const requireImageAltText: AccessibilityCheck = {
  name: 'image-alt-text',
  description: 'Every image in the layout must have non-empty alt text.',
  appliesToCollections: ['pages', 'programs', 'posts'],
  async check({ doc }) {
    const layout = (doc as any).layout as Array<{ blockType: string; alt?: string }> | undefined
    if (!Array.isArray(layout)) return { status: 'pass' }

    const missing = layout
      .filter((block) => block.blockType === 'image' || block.blockType === 'mediaBlock')
      .filter((block) => !block.alt?.trim())

    if (missing.length === 0) return { status: 'pass' }

    return {
      status: 'fail',
      message: `${missing.length} image block(s) missing alt text.`,
      remedy: 'Add descriptive alt text to each image block, or set alt="" if the image is purely decorative.',
      details: { missing: missing.map((b, i) => ({ index: i, blockType: b.blockType })) },
    }
  },
}
```

Register:

```typescript
publishingPlugin({
  // ...
  accessibilityChecks: [
    requireImageAltText,
    // others...
  ],
}),
```

When a page with missing alt text is published, the response is:

```json
{
  "error": {
    "code": "PUBLISH_REJECTED",
    "stage": "accessibility",
    "checkName": "image-alt-text",
    "reason": "2 image block(s) missing alt text.",
    "remedy": "Add descriptive alt text to each image block, or set alt=\"\" if the image is purely decorative.",
    "details": { "missing": [{ "index": 1, "blockType": "image" }, { "index": 4, "blockType": "image" }] }
  }
}
```

Claude reads `remedy` and `details` and fixes them inline before retrying.

## Example: SEO description present

```typescript
export const requireSeoDescription: AccessibilityCheck = {
  name: 'seo-description',
  description: 'Every published page must have a non-empty SEO description for search results.',
  async check({ doc }) {
    const description = (doc as any).seo?.description as string | undefined
    if (!description?.trim()) {
      return {
        status: 'fail',
        message: 'SEO description is empty.',
        remedy: 'Set seo.description to a 1–2 sentence summary; this appears in search results.',
      }
    }
    if (description.length > 160) {
      return {
        status: 'warn',
        message: `SEO description is ${description.length} characters; >160 may be truncated in search results.`,
      }
    }
    return { status: 'pass' }
  },
}
```

This one demonstrates `warn` — the publish proceeds, but the warning surfaces in the response and audit log. Use `warn` for things that are bad-but-not-blocking (a meta description over 160 chars displays truncated in Google but doesn't break the page).

## Example: external link-checker

```typescript
export const requireWorkingLinks: AccessibilityCheck = {
  name: 'working-links',
  description: 'External links must respond 2xx within a 5s timeout.',
  async check({ doc }) {
    const links = extractExternalLinks(doc)
    const broken: string[] = []

    for (const url of links) {
      try {
        const r = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        })
        if (!r.ok && r.status !== 405) broken.push(`${url} (${r.status})`)
      } catch (error) {
        broken.push(`${url} (${(error as Error).message})`)
      }
    }

    if (broken.length === 0) return { status: 'pass' }

    return {
      status: 'fail',
      message: `${broken.length} link(s) failed health check.`,
      remedy: 'Either fix the link or remove it.',
      details: { broken },
    }
  },
}
```

Three notes on this one:

- **It calls the network.** Stage 3 of the publish pipeline can do that, but every external check makes publish slower. If your site has lots of external links, consider running this as a `warn` (publish goes through; warning logged) or as an Inngest worker that runs *after* publish (rather than gating).
- **It can be flaky.** Transient network failures cause publish to fail. `warn` may be more appropriate.
- **It can be expensive.** A page with 50 external links runs 50 sequential HEAD requests inside one publish call. Parallelize with `Promise.allSettled` if you keep this synchronous.

## Per-collection scoping

If a check only applies to certain collections, set `appliesToCollections`:

```typescript
appliesToCollections: ['pages']  // skips 'posts', 'programs', etc.
```

The Publishing plugin filters on this before calling. Defaults to "all configured collections" when unset.

## Order of checks

Checks run in the order they're listed. The first failure short-circuits the rest. Order them roughly:

1. **Cheap, deterministic checks first** (field presence, regex matches)
2. **Schema / structural checks**
3. **Cross-field checks**
4. **Network or expensive checks last**

This keeps fast failures fast and doesn't pay for an expensive check when an early one would have failed anyway.

## When `pass`/`warn`/`fail` is the wrong taxonomy

Sometimes the check produces structured output that's neither boolean ("here are 12 broken links, but 11 of them are intentional 404 redirects in the marketing campaign system"). For those, write a Payload field validator instead — it can express richer logic and runs at save time, not just publish time.

`AccessibilityCheck` exists for clean three-way decisions at publish time. When you need richer behavior, the right primitive is usually a Payload hook.

## Testing checks

Each check is a pure-ish function. Test it like one:

```typescript
import { describe, it, expect } from 'vitest'
import { requireImageAltText } from './checks/image-alt'

describe('requireImageAltText', () => {
  it('passes when all images have alt text', async () => {
    const result = await requireImageAltText.check({
      collection: 'pages',
      doc: { layout: [{ blockType: 'image', alt: 'A photo of foo' }] },
      payload: {} as any,
    })
    expect(result.status).toBe('pass')
  })

  it('fails when an image lacks alt text', async () => {
    const result = await requireImageAltText.check({
      collection: 'pages',
      doc: { layout: [{ blockType: 'image' }] },
      payload: {} as any,
    })
    expect(result.status).toBe('fail')
    if (result.status === 'fail') {
      expect(result.message).toContain('1 image block')
    }
  })
})
```

## Where to look in code

- `packages/publishing/src/types.ts` — full `AccessibilityCheck` interface
- `packages/publishing/src/pipeline/accessibility.ts` — how checks get invoked
- `packages/publishing/src/checks/` — any framework-bundled checks (none required by default; everything is opt-in)
