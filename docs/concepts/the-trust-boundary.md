# The trust boundary

The most important concept in the framework. It's the answer to "if Claude can edit any field, what stops it from publishing junk?"

The answer: **the Publishing server is the only sanctioned path to `_status: 'published'`.** Direct writes through Payload MCP are blocked. Every publish goes through a seven-stage pipeline that can refuse for a structured, surfaced reason. The pipeline is the boundary.

## What the pipeline checks

In order, every `publish` call runs:

1. **Exists** — `findByID` returns the document and the caller has read access. Cheap and first because it short-circuits a lot of error paths.
2. **Composition** — the layout's blocks and props validate against the design system contract. Catches "Hero with two CTAs and three subtitles" violations the contract forbids.
3. **Accessibility** — registered `AccessibilityCheck` functions run. Each returns `pass | warn | fail`. Fails block; warns are reported but don't gate. See [Customizing accessibility checks](../guides/customizing-accessibility-checks.md).
4. **Required fields** — collection-level required-for-publish fields populated. Configured per collection; the example `pages` collection requires `seo.title`.
5. **Embargo** — `policy.embargoedUntil`, if set, must be in the past. Useful for press releases, regulated industries, time-sensitive announcements.
6. **Approval** — if `policy.requiresApproval`, an approval record exists with `status: 'granted'` for this document version.
7. **Execute** — actually flips `_status` to `'published'`, writes `publishedAt`, fires `content/page.published` on Inngest.

The first stage that fails returns a structured error like:

```json
{
  "error": {
    "code": "PUBLISH_REJECTED",
    "stage": "approval",
    "reason": "Page requires approval from \"editorial\".",
    "remedy": "Call request_approval to start the workflow."
  }
}
```

Claude reads the error, surfaces it conversationally, and (often) takes the suggested remedy itself.

## Why a pipeline and not "validation rules"

A pipeline gives you several things "validation rules" don't:

- **Order matters and is explicit.** Composition before accessibility is intentional — composition errors fail fast, accessibility is more expensive to compute.
- **Each stage is observable.** The audit log records which stage rejected and why. Debugging "this didn't publish" is one query.
- **Stages can short-circuit.** Once any gate fails, the rest don't run. You don't get a flood of secondary errors caused by a primary failure.
- **Stages are composable.** Adding a stage is registering a new check, not modifying validation logic across many fields.

## Why the Payload MCP can't bypass

Throughline's `auditPlugin` installs collection hooks that block `_status` mutations through any code path other than the Publishing plugin itself. Specifically:

- Payload MCP's `update` operation strips `_status` from incoming documents
- The Payload admin UI can't edit `_status` directly on configured collections — the field is set via a button that wraps the publish endpoint
- A REST/GraphQL client trying to PATCH `_status` gets a 403

The Publishing plugin uses an internal token (a Symbol-keyed bypass) to make the actual write itself. There is no public path that produces a published document without going through the pipeline.

## What about humans?

Humans get the same treatment. The "Publish" button in the admin UI calls the same Publishing MCP endpoint Claude would. An admin who tries to bypass the pipeline by editing the database directly bypasses the audit log too — which is generally what you want, because you'd rather an admin who's circumventing controls leave a trail in `pg_stat_activity` than blend in with normal traffic.

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

Subscribers (the Workflows package, the Integrations registry, anything you wire) react:

- `createRevalidateOnPublishFunction` calls `revalidatePath(...)` to flush the Next.js cache
- Integrations that subscribed receive the event and do their thing (sync to a CRM, post to Slack)
- Your custom workflows receive the event and do whatever else

Subscribers are isolated. A failing CRM sync doesn't roll back the publish — the publish already happened. The integration's failure surfaces in the audit log and the Inngest dashboard, where it can be retried independently.

## What the trust boundary does NOT do

- It does not prevent Claude from creating malicious content. Claude can still write objectionable text in fields. The boundary is about *publishing*, not authoring.
- It does not prevent Claude from spamming integrations. Rate limiting is the Integrations plugin's job, per integration.
- It does not prevent humans with database access from doing anything they want. The boundary is enforced at the application layer, not the storage layer. If you give someone Postgres credentials, you've given them everything.

The boundary's job is to make conversational publishing *safe*. Not to make the system *secure against hostile internal actors with database access*. Those are different problems.

## Where to look in code

- `packages/publishing/src/pipeline/*.ts` — the seven stages, one file each
- `packages/publishing/src/tools/publish.ts` — the MCP entry point that drives the pipeline
- `packages/core/src/audit/hooks.ts` — the `_status`-blocking hooks installed by `auditPlugin`
- `packages/components/src/contracts/composition-validator.ts` — what "composition" means in stage 2

## Next reading

- [Design system contracts](design-system-contracts.md) — what the composition stage validates against
- [Event-driven workflows](event-driven-workflows.md) — what happens after stage 7
