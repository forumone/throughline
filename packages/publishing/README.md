# @forumone/throughline-publishing

Policy-gated publishing server for Throughline. The trust boundary that decides what's allowed to ship.

## What this package provides

- **A publish pipeline** — `exist` → `composition` → `accessibility` → `required-fields` → `embargo` → `approval` → `execute`. The first step to object stops the publish and reports which one, why, and what to do about it.
- **A trust boundary** — a `beforeChange` hook on every configured collection that rejects direct writes to `_status`. The pipeline is the only sanctioned way to publish.
- **Admin controls** — Publish and Unpublish buttons that run the pipeline as the logged-in editor. Installed automatically; no host-side code.
- **A server-side API** — `publishDocument` / `unpublishDocument` / `getPublishStatus` for host code that needs to publish outside the admin.
- **Five MCP tools** served at `/api/publishing/mcp`: `publish`, `unpublish`, `schedule_publish`, `get_publish_status`, `rollback`.

## Installation

```bash
pnpm add @forumone/throughline-publishing
```

Peers: `payload@^3.0.0`, `inngest@^4.0.0`. Required runtime peer: `@forumone/throughline-core` (audit log). The admin controls additionally use `@payloadcms/ui` and `react`, both already present in any Payload 3 admin.

## Usage

```ts
import { buildConfig } from 'payload'
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { publishingPlugin } from '@forumone/throughline-publishing'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),
    publishingPlugin({
      inngest,
      collections: [{ slug: 'pages' }],
    }),
  ],
})
```

Publishable collections must have drafts enabled (`versions: { drafts: true }`).

## Publishing from the admin

The plugin replaces Payload's native Publish and Unpublish buttons on every configured collection. It has to: the native buttons submit `_status: 'published'` straight to the update endpoint, which is exactly the write the trust boundary exists to reject.

The replacements save pending edits as a draft, then call the plugin's own endpoint, which runs the full pipeline. **Run `payload generate:importmap` after adding the plugin** so Payload can resolve the components — the dev server does this for you; CI builds need it explicitly.

What you get:

- **No API key in the editorial publish path.** The endpoint authenticates off the Payload session cookie.
- **The person is the actor.** The audit event records the logged-in editor, with `mcpTool` set to `admin:publish` so admin publishes are distinguishable from MCP ones.
- **Access control still applies.** The write runs with `overrideAccess: false` as that user. Bypassing the status hook is not bypassing permissions.
- **Real feedback.** A blocked publish renders the failing step, its issues, and its suggestion — not a generic error.

The Publish button is hidden on the create view: the pipeline's first step is `exist`, so there is nothing to evaluate until the draft is saved. Use Payload's Save Draft button, then publish from the edit view.

To supply your own controls instead, either set `admin.components.edit.PublishButton` on the collection yourself (an explicit host setting always wins), or turn the feature off entirely:

```ts
publishingPlugin({ inngest, collections: [{ slug: 'pages' }], adminComponents: false })
```

With `adminComponents: false` the admin has **no** working publish path until you supply one — the native buttons will still be rejected by the hook.

### Endpoints

| Route | Auth | Body |
|---|---|---|
| `POST /api/publishing/publish` | Payload session | `{ collection, id }` |
| `POST /api/publishing/unpublish` | Payload session | `{ collection, id }` |
| `POST /api/publishing/mcp` | Bearer API key | JSON-RPC |

A publish blocked by the pipeline returns **200** with `{ published: false, failedAt, reason, code, issues, suggestion }`. The pipeline ran correctly and the answer was no; that is not a transport error. Non-2xx is reserved for auth (401/403), bad input (400), and genuine failures (500).

## Publishing from host code

`runPublishPipeline` needs plugin options and an audit writer that only exist inside the plugin. Rather than export the raw pipeline, the plugin attaches a service to the Payload instance at `onInit` and exposes these helpers:

```ts
import { publishDocument, unpublishDocument, getPublishStatus } from '@forumone/throughline-publishing'

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
- `beforeChange` rejects writes that change the **live** document's `_status`.

| Write | Result |
|---|---|
| `draft: true` on a draft or published document | **allowed** — writes a version, live status unchanged |
| `draft: false`, `_status: 'published'` | **blocked** — publish through the pipeline |
| `draft: false`, `_status: 'draft'` on a published document | **blocked** — unpublish through the pipeline |
| `draft: true` with `_status: 'published'` | **blocked** — Payload treats this as a publish, not a draft save |
| Any write carrying `bypassPublishingServer` | **allowed** |

Draft saves have to be allowed explicitly because Payload sets `data._status = 'draft'` on every `draft: true` update before `beforeChange` runs, whether or not the caller supplied it — so at that point a draft save of a published document and an unpublish look identical. The `draft` flag is read from the operation's own arguments in `beforeOperation`, which sees it the same way on the Local API, REST and GraphQL. (`req.query.draft` is only populated on the REST path, so keying on the request would cover the admin and silently miss scripts.)

If you install `createBlockStatusWritesHook` yourself without the recorder, it fails closed: every status change is blocked.

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

It skips composition, accessibility, required-field, embargo, and approval checks. Nothing in the admin path uses it.

> **Note:** the hook guards `update` only. `payload.create({ data: { _status: 'published' } })` is not intercepted, so a create can publish without the pipeline. Save as a draft and publish in a second step if that matters to you.

## Warnings

A publish or unpublish writes the document first, then emits its Inngest event. The event is a consequence of the write, not a step in it — so if the emission fails, the action still reports success and carries a warning:

```jsonc
{ "published": true, "publishedAt": "…", "warnings": ["The content/page.published event could not be sent, …"] }
```

The admin shows these as a warning toast on an otherwise successful publish. Reporting failure for a write that landed would tell an editor their change isn't live when it is, and the obvious response to that is to publish again over live content.

`rollback` and `schedule_publish` behave the same way.

## Custom accessibility checks

The built-in checks (`alt-text`, `heading-hierarchy`, `link-labels`) are exported from `@forumone/throughline-publishing/checks`. Add your own via `accessibilityChecks`:

```ts
publishingPlugin({
  inngest,
  collections: [{ slug: 'pages' }],
  accessibilityChecks: [
    {
      name: 'no-empty-tables',
      run: (doc) => (hasEmptyTable(doc) ? [{ message: 'Table has no rows', severity: 'error' }] : []),
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
