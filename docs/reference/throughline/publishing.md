# Publishing: `@forumone/throughline/publishing`

This was `@forumone/throughline-publishing` in 0.x; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

Policy-gated publishing server for Throughline. The trust boundary that decides what's allowed to ship.

## What this package provides

- **A publish pipeline** — `exist` → `composition` → `accessibility` → `required-fields` → `link-targets` → `embargo` → `approval` → `execute`. The first step to object stops the publish and reports which one, why, and what to do about it.
- **A trust boundary** — a `beforeChange` hook on every configured collection that rejects direct writes to `_status`. The pipeline is the only sanctioned way to publish.
- **Admin controls** — Publish and Unpublish buttons that run the pipeline as the logged-in editor, and a Schedule control. Installed automatically; no host-side code.
- **Scheduled publishing** — declare a `date` field named `scheduledPublishAt` (or your `scheduledPublishField`) on a collection and the plugin renders it as a Schedule control, runs the pipeline's checks when a time is picked, and sends `content/page.scheduled` whenever the time changes. Pair it with `createPublishAtScheduledTimeFunction` from `@forumone/throughline/publishing`, which publishes at that time. A publish or unpublish clears the field.
- **A server-side API** — `publishDocument` / `unpublishDocument` / `scheduleDocument` / `unscheduleDocument` / `getPublishStatus` for host code that needs to publish outside the admin.
- **Five MCP tools** — `publish`, `unpublish`, `schedule_publish`, `get_publish_status`, `rollback` — handed to the host's collector at `onInit` and served by `@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody.

## Installation

Part of [`@forumone/throughline`](../throughline.md#installation), which lists the optional peers each subpath needs. `throughline({ publishing: { … } })` registers it, after the audit log; registered by hand, it needs `auditPlugin` from `/audit` first. Its `collections` come from `throughline()`'s own; the [options table](../throughline.md#throughline-options) has the keys it adds for revalidation and scheduling. The admin controls use `@payloadcms/ui` and `react`, both already present in any Payload admin.

## Usage

```ts
import { throughline } from '@forumone/throughline'
import { inngestJobs } from '@forumone/throughline/jobs/inngest'

export const suite = throughline({
  jobs: inngestJobs(inngest),
  collections: ['pages'],
  publishing: {
    urls: { pages: (slug) => `/${slug}` }, // for the revalidation job
  },
})
```

Publishable collections must have drafts enabled (`versions: { drafts: true }`). Registered by hand instead, it goes after `auditPlugin`, and takes `inngest` and `mcpTools` itself.

## Publishing from the admin

The plugin replaces Payload's native Publish and Unpublish buttons on every configured collection. It has to: the native buttons submit `_status: 'published'` straight to the update endpoint, which is exactly the write the trust boundary exists to reject.

The replacements save pending edits as a draft, then call the plugin's own endpoint, which runs the full pipeline. **Run `payload generate:importmap` after adding the plugin** so Payload can resolve the components — the dev server does this for you; CI builds need it explicitly.

What you get:

- **No API key in the editorial publish path.** The endpoint authenticates off the Payload session cookie.
- **The person is the actor.** The audit event records the logged-in editor, with `mcpTool` set to `admin:publish` so admin publishes are distinguishable from MCP ones.
- **Access control still applies.** The write runs with `overrideAccess: false` as that user. Bypassing the status hook is not bypassing permissions.
- **Real feedback, on the field that caused it.** A blocked publish renders the failing step, its issues, and its suggestion — and every issue naming a field is marked on that field, with an error count on the collapsed block row containing it. An issue with no field (an embargo, a missing approval) stays in the toast, which is where the full list still appears.
- **One notice per action.** The interim draft save the button performs does not announce itself; publishing says "published" once.

The Publish button is hidden on the create view: the pipeline's first step is `exist`, so there is nothing to evaluate until the draft is saved. Use Payload's Save Draft button, then publish from the edit view.

To supply your own controls instead, either set `admin.components.edit.PublishButton` on the collection yourself (an explicit host setting always wins), or turn the feature off entirely:

```ts
throughline({ /* … */ publishing: { adminComponents: false } })
```

With `adminComponents: false` the admin has **no** working publish path until you supply one — the native buttons will still be rejected by the hook.

### Endpoints

| Route                            | Auth            | Body                 |
| -------------------------------- | --------------- | -------------------- |
| `POST /api/publishing/publish`   | Payload session | `{ collection, id }` |
| `POST /api/publishing/unpublish` | Payload session | `{ collection, id }` |

Those two, and nothing else. This plugin used to serve `POST /api/publishing/mcp`
on a JSON-RPC subset written here; it is deleted, along with the five others like
it.

### Serving these tools through Payload's MCP plugin

Payload ships `@payloadcms/plugin-mcp` — the official MCP SDK, streamable HTTP, sessions, and per-key per-tool capability checkboxes an admin can see and change. It is the only way these tools reach a client:

```ts
plugins: [
  suite.plugin,
  mcpPlugin({ mcp: { tools: suite.mcpTools }, overrideApiKeyCollection: mcpApiKeyAccess(isAdmin) }),
]
```

Every handler here is built at `onInit`, because every one closes over `payload`; `mcpPlugin` takes its tools as a config option. The collector `throughline()` builds bridges that in two steps: this plugin **declares** its tools' names and descriptions as the config is built — which is when `mcpPlugin` reads the array to generate one per-key checkbox per tool — and **binds** the handlers at `onInit`, which is still before any request. Hand over `suite.mcpTools` itself rather than a copy.

**`suite.plugin` must come before `mcpPlugin` in that array.** Declaring after it has been read means no checkboxes, and a tool with no checkbox is denied to every key with no error anywhere.

One thing does not survive the move: `plugin-mcp` resolves a key to its linked user and does not carry the key document forward, so the calling key's _name_ is not recoverable. Audit rows record the strategy instead, or a name the host passes as `apiKeyName`.

A publish blocked by the pipeline returns **200** with `{ published: false, failedAt, reason, code, issues, suggestion }`. The pipeline ran correctly and the answer was no; that is not a transport error. Non-2xx is reserved for auth (401/403), bad input (400), and genuine failures (500).

A field the collection itself refuses is one of those blocks — `failedAt: 'execute'`, `code: 'field-validation-failed'`, with Payload's own field paths as `issues`. The publishing write is the first step that enforces `required`, because a draft write deliberately does not, so an empty required field inside a block is caught there and nowhere earlier.

## Publishing from host code

`runPublishPipeline` needs plugin options and an audit writer that only exist inside the plugin. Rather than export the raw pipeline, the plugin attaches a service to the Payload instance at `onInit` and exposes these helpers:

```ts
import {
  publishDocument,
  unpublishDocument,
  getPublishStatus,
} from '@forumone/throughline/publishing'

// In a custom endpoint, job, or Server Action:
const result = await publishDocument({
  payload: req.payload,
  collection: 'pages',
  id: '42',
  user: req.user, // attributed in the audit log; their permissions apply
})

if (!result.published) {
  console.log(result.failedAt, result.reason, result.suggestion)
}
```

All three run the same pipeline the admin and MCP paths use, so host code cannot drift from the plugin's policy. `getPublishStatus` runs every check except the write and mutates nothing.

## What the trust boundary blocks

The plugin installs two hooks on every configured collection, and they work as a pair:

- `beforeOperation` records whether the update in flight is a draft write.
- `beforeChange` rejects writes that would change the **live** document: its `_status`, its content, or whether it exists.

The question they answer is not "did `_status` change" but **would this write change what the public sees**:

| Write                                                                                 | Result                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Any `draft: true` save                                                                | **allowed** — writes a version, the live document is untouched   |
| A field edit of a published document                                                  | **blocked** — save a draft, then publish                         |
| A write that changes nothing live (Payload's "Revert to published")                   | **allowed**                                                      |
| A create with `_status: 'published'`                                                  | **blocked** — create a draft, then publish                       |
| A field edit carrying `DERIVED_WRITE_CONTEXT`, live with nothing pending              | **allowed** — data derived from the page, written back to it     |
| A `_status: 'draft'` write to a document that was never published, or is already down | **allowed** — nothing is live                                    |
| `_status: 'draft'` on a live document                                                 | **blocked** — unpublish through the pipeline                     |
| `_status: 'published'` on a draft document                                            | **blocked** — publish through the pipeline                       |
| A non-draft write while a draft is pending                                            | **blocked** — this is the publish, or an accidental unpublish    |
| `draft: true` with `_status: 'published'`                                             | **blocked** — Payload treats this as a publish, not a draft save |
| Any write carrying `bypassPublishingServer`                                           | **allowed**                                                      |

Three things about Payload's update pipeline make this less obvious than it looks, and each has caused a defect here:

1. **`data` is the stored document merged with the caller's changes**, so `_status` is present on nearly every update. An ordinary field edit of a published page arrives carrying `_status: 'published'`. The presence of `_status` means nothing by itself.
2. **Payload injects `data._status = 'draft'` into every `draft: true` update** before `beforeChange` runs, whether or not the caller supplied it — so a draft save of a published document is shaped exactly like an unpublish. The real `draft` flag is read in `beforeOperation`, which sees it identically on the Local API, REST and GraphQL. (`req.query.draft` is only populated on the REST path, so keying on the request would cover the admin and silently miss scripts.)
3. **`originalDoc` is the latest version, not the live document.** Once a draft is pending on a published page, `originalDoc._status` is `'draft'` while the page is still live. Comparing the two statuses therefore reads a genuine unpublish as a harmless no-op.

A consequence of (1) and (3) worth knowing: once a draft is pending, a plain `payload.update(...)` with no `draft: true` would carry the pending draft's `'draft'` status and take the page down. That is blocked. Pass `draft: true` to edit the draft, or publish through the pipeline.

If you install `createBlockStatusWritesHook` yourself without the recorder, it fails closed: every status change is blocked. The behaviour above is verified against a real Payload instance in `block-status-writes.integration.test.ts`.

## Bypassing the pipeline

`bypassPublishingServer: true` in the Payload request context is the only way to write `_status` without the pipeline. It is intended for seed scripts and migrations:

```ts
await payload.update({
  collection: 'pages',
  id,
  data: { _status: 'published' },
  context: { bypassPublishingServer: true },
})
```

It skips composition, accessibility, required-field, link-target, embargo, and approval checks. Nothing in the admin path uses it.

A create carrying `bypassPublishingServer` may be published at once, for a seed.

### Derived data on a live page

Some writes to a live page are not edits: an audio rendition's URL written back after it is generated, a sync's timestamp. Running them through the pipeline would gate the page on its own side effect, so they carry `DERIVED_WRITE_CONTEXT`:

```ts
import { DERIVED_WRITE_CONTEXT } from '@forumone/throughline/publishing'

await payload.update({
  collection: 'posts',
  id,
  data: { narration },
  context: DERIVED_WRITE_CONTEXT,
})
```

It is allowed only on a document that is live with nothing pending, and only for a write that keeps it published. It cannot create, unpublish, or promote a pending draft — that is still a publish. Use it for data the site derives, never for an editor's change.

## Warnings

A publish or unpublish writes the document first, then emits its Inngest event. The event is a consequence of the write, not a step in it — so if the emission fails, the action still reports success and carries a warning:

```jsonc
{
  "published": true,
  "publishedAt": "…",
  "warnings": ["The content/page.published event could not be sent, …"],
}
```

The admin shows these as a warning toast on an otherwise successful publish. Reporting failure for a write that landed would tell an editor their change isn't live when it is, and the obvious response to that is to publish again over live content.

`rollback` and `schedule_publish` behave the same way.

## Composed sections

A block that holds a recipe (see [recipes](../design-system/recipes.md)) has no contract in the manifest, so the composition step would otherwise call it an unknown component. Configure `recipes`, and the step checks the recipe instead:

```ts
throughline({
  publishing: {
    recipes: { blockType: 'ComposedSection', collection: 'section-recipes' },
  },
})
```

For each such block, the step requires that:

- **the recipe exists** (`recipe-missing`);
- **it is approved** (`recipe-not-approved`). By default that means `status === 'approved'`; pass `isApproved` to decide otherwise;
- **it still passes `lintRecipe`** against the manifest as the components plugin loads it now, not as it was when the recipe was saved (`recipe-lint`);
- **the block's content fills the recipe's required fields** (`recipe-content`).

The recipe is read past access control, so a draft recipe fails for not being approved, not for not being found. `recipeField` and `contentField` name the block's fields, and default to `recipe` and `content`.

The composition step also refuses an **empty block** (`empty-block`): one whose contract has content to fill (text, rich text, a link, an image, a video, an array or a group), every piece of which is empty. Without it, a call to action with no heading, label or link publishes as an empty band. It doesn't apply to a component with no content fields, or one that fetches its own data. Settings such as a select or a checkbox don't count as content.

The composition step also checks **placement** for every block. A component whose contract places it only `inline` (inside another component) can't stand on a page by itself.

## Links to pages readers can't see

An internal link stores a relationship, and the page resolves it when it is read. If the page it goes to is a draft, in the trash, or deleted, the link renders as nothing or as a 404. The `link-targets` step refuses that publish (`code: 'link-targets'`) and names each link (forumone-2026#756).

It reads the document's links, looks up every target (one query per collection, past access control, including the trash), and decides:

| The target | Result | `rule` |
| --- | --- | --- |
| doesn't exist | error | `deleted` |
| is in the trash | error | `trash` |
| has drafts and isn't published | error | `draft` |
| isn't published, but has a scheduled publish time | warning | — |
| is published, or its collection has no drafts | passes | — |

A schedule only counts in a collection this plugin publishes, because that is where it knows the `scheduledPublishField`. A warning doesn't block. It reaches the publish result's `warnings`, because a page that goes live with the page it links to is fine. A link back to the document being published is skipped.

Each issue's `field` is the link's data path, such as `layout[2].items[0].href.reference`, so the admin marks the field. For a link in rich text, it is the rich-text field's path. The messages are for editors. They name the block by position and label, or the field by its label, and the target by its title (`admin.useAsTitle`) or its collection's singular label:

> A link in block 3 (Card Grid) goes to "Annual report", which is a draft, so readers would get a page that doesn't exist. Publish "Annual report" first, or change the link.

### What counts as a link

The step uses the same structural walk as `/media`'s reference finder, through groups, arrays, tabs, blocks (including `blocksAsJSON` and `blockReferences`) and Lexical blocks. A link is one of these:

- **A relationship field marked as a link target**, with `custom: { throughlineLinkTarget: true }`. Every link the design-system generator builds marks its `reference` like this. Mark your own hand-written link fields with `markLinkTarget`:

  ```ts
  import { markLinkTarget } from '@forumone/throughline/publishing'

  markLinkTarget({ name: 'reference', type: 'relationship', relationTo: ['pages', 'posts'] })
  ```

  A marked field counts only when it is the live branch of its link. It is skipped when a sibling `mode` is set to anything other than `internal`, because a link switched to "Another site" keeps its old reference. If your link group uses a different shape, pass the rule yourself: `markLinkTarget(field, { when: (siblings) => siblings.type === 'reference' })`.

- **An internal link in rich text**: a Lexical `link` or `autolink` node with `linkType: 'internal'`.

Other relationships, such as an author or a list of related items, are not links.

To switch the step off, use `linkTargets: { enabled: false }`. `linkTargetsIn(fields, data)` is exported too, if you want to list a document's links yourself.

## Custom accessibility checks

The built-in checks (`alt-text`, `heading-hierarchy`, `link-labels`) are exported from `@forumone/throughline/publishing`. Add your own via `accessibilityChecks`:

```ts
publishingPlugin({
  inngest,
  collections: [{ slug: 'pages' }],
  accessibilityChecks: [
    {
      name: 'no-empty-tables',
      run: (doc) =>
        hasEmptyTable(doc) ? [{ message: 'Table has no rows', severity: 'error' }] : [],
    },
  ],
})
```

`accessibilityChecks` appends. To switch a built-in off — because it misfires on your content shape, or you want to replace it — name it in `disableAccessibilityChecks`:

```ts
publishingPlugin({
  inngest,
  collections: [{ slug: 'pages' }],
  disableAccessibilityChecks: ['alt-text'],
  accessibilityChecks: [myOwnAltTextCheck],
})
```

### A note on uploads

The `alt-text` check walks the document for image-shaped objects but does **not** descend into a populated upload's `sizes` map. Payload's generated derivatives carry `filename` and `mimeType` but never `alt` — that lives on the parent document — so treating them as images would report one false failure per configured `imageSize`. Alt text is checked once, on the parent.
