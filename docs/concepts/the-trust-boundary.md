# The trust boundary

The most important concept in the framework. It's the answer to "if Claude can edit any field, what stops it from publishing junk?"

The answer: **the publishing pipeline is the only sanctioned path to what the public sees.** Publishing, unpublishing, creating a document as published, and editing a live one are all refused outside it, however they arrive. Every publish goes through a seven-stage pipeline that can refuse for a structured, surfaced reason. The pipeline is the boundary.

## What the pipeline checks

In order, every `publish` call runs:

1. **Exists** — `findByID` returns the document and the caller has read access. Cheap and first because it short-circuits a lot of error paths.
2. **Composition** — the layout's blocks and props validate against the design system contract. Catches "Hero with two CTAs and three subtitles" violations the contract forbids.
3. **Accessibility** — the built-in and registered `AccessibilityCheck`s run. Each returns a list of issues; an `error` blocks. See [Customizing accessibility checks](../guides/customizing-accessibility-checks.md).
4. **Required fields** — collection-level required-for-publish fields populated. Configured per collection; the example `pages` collection requires `seo.title`.
5. **Embargo** — `policy.embargoedUntil`, if set, must be in the past. Useful for press releases, regulated industries, time-sensitive announcements.
6. **Approval** — if `policy.requiresApproval`, an approval record exists with `status: 'granted'` for this document version.
7. **Execute** — actually flips `_status` to `'published'`, writes `publishedAt`, fires `content/page.published` on Inngest.

The first stage that fails returns a structured result like:

```json
{
  "published": false,
  "failedAt": "approval",
  "code": "approval-required",
  "reason": "This document requires approval and no granted approval exists for the current version",
  "suggestion": "…"
}
```

Claude reads the error, surfaces it conversationally, and (often) takes the suggested remedy itself.

## Why a pipeline and not "validation rules"

A pipeline gives you several things "validation rules" don't:

- **Order matters and is explicit.** Composition before accessibility is intentional — composition errors fail fast, accessibility is more expensive to compute.
- **Each stage is observable.** The audit log records which stage rejected and why. Debugging "this didn't publish" is one query.
- **Stages can short-circuit.** Once any gate fails, the rest don't run. You don't get a flood of secondary errors caused by a primary failure.
- **Stages are composable.** Adding a stage is registering a new check, not modifying validation logic across many fields.

## Why nothing else can bypass

`publishingPlugin` installs a `beforeChange` hook on every governed collection that asks one question of every write, from the admin, REST, GraphQL, the Local API or Payload's own MCP tools: **would this change what the public sees?** If so, and the write is not the pipeline's own, it is refused with a 400 that says what to do instead:

- **Publishing or unpublishing** — a write that changes the live document's `_status`, or promotes a pending draft.
- **Creating a document as published** — it would be live the moment it existed. Create it as a draft, then publish it.
- **Editing a live document** — a non-draft save that changes its content. Save a draft, then publish it. So "requires approval" holds for every change to a live page, not only the first publish.
- **Trashing a live document, or restoring one straight to published.**

A draft save is always allowed: it writes a version and leaves the live page alone, which is what the admin's Save Draft and autosave do. So is a write that changes nothing live, such as Payload's "Revert to published".

Two context flags let code past it. The pipeline's own write carries `bypassPublishingServer`, which seed scripts and migrations may use too. And `DERIVED_WRITE_CONTEXT`, from `/publishing`, lets a system write data it derived from a live page back to it — an audio rendition's URL, a sync timestamp — without gating the page on its own side effect. That one can never change `_status`, create, or promote a draft.

## What about humans?

Humans get the same treatment. The "Publish" button in the admin UI runs the same pipeline Claude's `publish` tool does. An admin who tries to bypass the pipeline by editing the database directly bypasses the audit log too — which is generally what you want, because you'd rather an admin who's circumventing controls leave a trail in `pg_stat_activity` than blend in with normal traffic.

## Extending the pipeline

You don't add stages — the seven are fixed. You extend the existing stages:

- **More AccessibilityChecks**: register `AccessibilityCheck` instances on the publishing plugin's options. Add brand-voice checks, link-checking, image-alt-presence, whatever your operations want gated. See [Customizing accessibility checks](../guides/customizing-accessibility-checks.md).
- **More required-for-publish fields**: configure them at the collection level. The plugin reads them, doesn't bake them in.
- **More approval groups**: configure them on the approvals plugin.
- **More embargo logic**: the embargo gate uses a single field. If your domain needs richer scheduling (e.g. timezone-specific embargoes, recurring blackout windows), wrap your domain logic in a field-level `validate` and let the existing gate enforce.

If you find yourself wanting an eighth stage, the right move is usually a custom AccessibilityCheck — those run real functions and can express most policies.

## What happens after publish

Once stage 7 succeeds:

```
inngest.send('content/page.published', {
  data: { collection, id, version, publishedBy, publishedAt },
})
```

Subscribers (the suite's jobs, each integration's, anything you wire) react:

- `revalidateOnPublishJob` calls `revalidatePath(...)` to flush the Next.js cache
- Integrations that subscribed receive the event and do their thing (sync to a CRM, post to Slack)
- Your custom workflows receive the event and do whatever else

Subscribers are isolated. A failing CRM sync doesn't roll back the publish — the publish already happened. The integration's failure surfaces in the audit log and the Inngest dashboard, where it can be retried independently.

## What the trust boundary does NOT do

- It does not prevent Claude from creating malicious content. Claude can still write objectionable text in fields. The boundary is about *publishing*, not authoring.
- It does not prevent Claude from spamming integrations. Rate limiting is the Integrations plugin's job, per integration.
- It does not make your access rules right. The pipeline guards publishing. Who can read drafts or manage MCP keys depends on your collections' `access` blocks. A rule that treats any `req.user` as signed in will also admit an MCP key document on REST. See [Security model](../operations/security-model.md#signed-in-is-not-booleanrequser).
- It does not prevent humans with database access from doing anything they want. The boundary is enforced at the application layer, not the storage layer. If you give someone Postgres credentials, you've given them everything.

The boundary's job is to make conversational publishing *safe*. Not to make the system *secure against hostile internal actors with database access*. Those are different problems.

## Where to look in code

- `packages/throughline/src/publishing/pipeline/steps/*.ts` — the seven stages, one file each
- `packages/throughline/src/publishing/tools/publish.ts` — the MCP entry point that drives the pipeline
- `packages/throughline/src/publishing/hooks/block-status-writes.ts` — the `_status`-blocking hooks installed by `publishingPlugin`
- `packages/throughline/src/components/validation/composition.ts` — what "composition" means in stage 2

## Next reading

- [Design system contracts](design-system-contracts.md) — what the composition stage validates against
- [Event-driven workflows](event-driven-workflows.md) — what happens after stage 7
