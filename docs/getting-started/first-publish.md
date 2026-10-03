# First publish

End state: a page that has gone through the full publish pipeline — composition validation, accessibility, required-field checks, embargo, approval — and is now live.

Prerequisite: [First Claude connection](first-claude-connection.md). Your client should list the components and publishing tools.

## Why this matters

This is the moment Throughline clicks. Anywhere else, asking an LLM to "publish a page" runs straight to the database. Here, the same prompt runs through a seven-step pipeline that can — and should — refuse. Watching it refuse is more important than watching it succeed.

## 1. Let Claude edit pages

Throughline's tools publish, schedule and approve; they don't create or edit documents. That is Payload's own MCP CRUD, which `mcpPlugin` serves only for collections you name, and the scaffold names none. Add `pages` in `apps/web/src/payload.config.ts`:

```ts
mcpPlugin({
  collections: { pages: { enabled: { find: true, create: true, update: true } } },
  mcp: { tools: suite.mcpTools },
  overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
}),
```

Leave `delete` off. This adds per-collection checkboxes to the key collection, so it is a schema change: run `pnpm --dir apps/web migrate:create mcp-pages`, `migrate`, `generate:types` and `generate:importmap`, restart `pnpm dev`, and tick the new **pages** boxes on your key. Your client now has `findPages`, `createPages` and `updatePages`.

(If you'd rather not, create and edit the page in the admin wherever this walkthrough asks Claude to, and use Claude only for the publishing steps.)

## 2. Draft the page

Ask Claude:

```
Create a draft "About us" page with the slug "about".
```

Claude calls `createPages` with `draft: true`. The page now exists with `_status: 'draft'`.

You can verify in the admin: `http://localhost:3000/admin/collections/pages` should show your new draft.

The scaffold's `Pages` has no layout field, so there is nothing for the composition step to check yet. When you add one — a blocks field named `layout` — Claude composes it with `suggest_for_intent` and `validate_composition` before writing, and the pipeline runs the same validator again at publish.

## 3. Try to publish (and watch it fail)

```
Publish the About us page.
```

Claude calls `publish`. It fails:

```json
{
  "published": false,
  "failedAt": "required-fields",
  "code": "required-fields-missing",
  "reason": "2 required fields missing",
  "issues": [
    { "field": "seo.title", "message": "SEO title is required", "severity": "error" },
    { "field": "seo.description", "message": "SEO description is required", "severity": "error" }
  ],
  "suggestion": "Fill in the missing fields and try again."
}
```

This is the **required-fields step** refusing. The publishing pipeline runs seven steps in order:

1. **Exist** — the document exists, and is not already published with nothing new to publish
2. **Composition** — the layout is valid against the design system contract
3. **Accessibility** — the registered accessibility checks pass
4. **Required fields** — SEO title and description, the slug, and any per-collection required fields are populated
5. **Embargo** — `policy.embargoedUntil` has passed (or isn't set)
6. **Approval** — if `policy.requiresApproval`, a granted approval exists for the document's current content
7. **Execute** — the actual write to `_status: 'published'`

The first step that fails returns a structured result that Claude can read and act on. `get_publish_status` runs steps 1–6 without publishing, if you want to ask "would this go live?" first. Outside the pipeline, an update that puts a draft live or takes a live page down is refused — through `updatePages`, the REST API or the admin alike — with `Direct writes to _status are not allowed`.

One kind of write is not refused: a non-draft edit of a page that is already live with no draft pending. It changes the live page directly, without running the pipeline. Draft saves never touch the live page, so once a page is published, ask Claude for draft saves.

## 4. Fix the issue

```
Set the SEO title to "About us — Acme Climate" and the description to
"How and why Acme Climate exists." Then publish.
```

Claude updates the SEO fields and calls `publish` again. With `policy.requiresApproval` unset on this page, it succeeds. The audit log records both attempts: the rejection and the publish.

## 5. Read the audit trail

```
Show me the change history for the About us page.
```

Claude calls `get_change_history`. The result lists the `publishing.publish` events for the page: the failed one, with its reason, and the one that succeeded.

This is also where you'll look later when you're debugging "why didn't this publish?" — every publish attempt is recorded with the reason it stopped.

## 6. Try the approval gate

This step needs two things the scaffold leaves as stubs in `payload.config.ts`: `approvals.groupResolver.resolveUsers`, which turns a group into users, and `email.resolveApprover` / `resolveRequester`, which turn a user id into an address. Both return nobody until you write them; [Configuring approvers](../guides/configuring-approvers.md) shows a `resolveUsers` that reads the `users` collection's `groups` field. Then put a second user, with a real inbox, in the `editorial` group. You can't approve your own request.

In the Payload admin, edit your page. In the **Policy** group, check `requiresApproval`. Save.

Now ask Claude:

```
Save a draft that changes the About us page's title to "About Acme Climate,"
then publish.
```

Claude calls `updatePages` with `draft: true` and then `publish`. The approval step refuses:

```json
{
  "published": false,
  "failedAt": "approval",
  "code": "approval-required",
  "reason": "This document requires approval and no granted approval exists for the current version",
  "suggestion": "Use the Approvals Server to request approval. Once granted, publish will succeed."
}
```

Then:

```
Request approval from editorial.
```

Claude calls `request_approval` with a summary of the change and `approverGroups: ["editorial"]`. This:

- Creates a pending record in the `approvals` collection, bound to a hash of the page's current content
- Resolves the `editorial` group to users through your `groupResolver`
- Sends `approval/requested`
- The `notify-approval-request` job emails each approver three signed links: approve, request changes and discuss

In your Inngest dev dashboard (http://localhost:8288), you'll see the job run.

The approval is for the content as it is now. Edit the page again and it no longer counts; request a new one.

## 7. Decide via email

The links in the approval email have the shape:

```
http://localhost:3000/api/approvals/action?token=<HMAC-signed>
```

The token carries the approval, the approver and the action. Clicking "Approve" shows a confirmation page — so one misclick can't decide anything — and confirming records the decision without logging in. Ask Claude to publish again — this time the approval step passes.

If the approver would rather decide from chat, they use their own MCP key:

```
Approve the latest approval request for the About us page.
```

Claude calls `respond_to_approval`, which refuses anyone who is not in one of the request's groups and anyone deciding their own request.

## What just happened

You exercised Throughline's trust boundary in one session:

- Required-field step (first publish attempt)
- Approval step (second publish attempt)
- Signed email decisions (no-login approver UX)
- Audit log capturing every attempt

Composition validation is the one layer this page didn't reach, because the scaffold's `Pages` has no layout yet.

If any of those steps had stayed in the way, you would not have been able to publish — including from the Payload admin, whose Publish button runs the same pipeline. That's deliberate. See [The trust boundary](../concepts/the-trust-boundary.md) for why this design exists and how to extend it.

## Next

[Deploying to Vercel](deploying-to-vercel.md) walks through getting this same setup running in production.
