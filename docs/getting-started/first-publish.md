# First publish

End state: a page that has gone through the full publish pipeline — composition validation, accessibility, required-field checks, embargo, approval — and is now live.

Prerequisite: [First Claude connection](first-claude-connection.md). You should have at least Components and Publishing wired up.

## Why this matters

This is the moment Throughline clicks. Anywhere else, asking an LLM to "publish a page" runs straight to the database. Here, the same prompt runs through a seven-stage pipeline that can — and should — refuse. Watching it refuse is more important than watching it succeed.

## 1. Draft the page

Ask Claude:

```
Create a draft "About us" page at /about with a Hero (headline:
"We make conversational CMS frameworks") and a SectionIntro
("Our story", "Founded in 2026 to make publishing feel like writing").
```

Claude calls `propose_components` to vet the layout, then `create` (or the equivalent collection-create tool) on the Payload MCP. The page now exists with `_status: 'draft'`.

You can verify in the admin: `http://localhost:3000/admin/collections/pages` should show your new draft.

## 2. Try to publish (and watch it fail)

```
Publish the About us page.
```

Claude calls `publish` on the Publishing MCP. It almost certainly fails with something like:

```
PUBLISH_REJECTED: missing-required-field
The "seo.title" field is required for publishing pages but is empty.
```

This is the **required-fields gate** firing. The Publishing pipeline runs seven gates in order:

1. **Exists** — the document exists and is visible to the caller
2. **Composition** — the layout is valid against the design system contract
3. **Accessibility** — registered AccessibilityChecks pass
4. **Required fields** — collection-level required-for-publish fields are populated
5. **Embargo** — `policy.embargoedUntil` has passed (or isn't set)
6. **Approval** — if `policy.requiresApproval`, an active approval exists
7. **Execute** — the actual `update` to `_status: 'published'`

The first gate that fails returns a structured error that Claude can read and act on. There is no path to "published" that bypasses this pipeline. Direct `_status` writes through the Payload MCP are blocked.

## 3. Fix the issue

```
Set the SEO title to "About us — Acme Climate" and the description to
"How and why Acme Climate exists." Then publish.
```

Claude updates the SEO fields and tries `publish` again. If `policy.requiresApproval` is unset on this page, it should now succeed. The audit log records both attempts: the rejection and the eventual publish.

## 4. Read the audit trail

```
Show me the recent audit events for the About us page.
```

Claude calls `get_change_history` on the Audit MCP. The result lists every change: `content.created`, the failed `content.publish_attempted` with the rejection reason, the field updates, and the final `content.published`.

This is also where you'll look later when you're debugging "why didn't this publish?" — the audit log captures every gate's verdict.

## 5. Try the approval gate

In the Payload admin, edit your page. In the **Policy** group, check `requiresApproval` and select an approver group (e.g. `editorial`). Save.

Now ask Claude:

```
Update the About us page's hero headline to "We build the CMS Claude
runs," then publish.
```

Claude updates the field and calls `publish`. The approval gate fires:

```
PUBLISH_REJECTED: approval-required
This page requires approval from "editorial" before it can publish.
Use request_approval to start the workflow.
```

Then:

```
Request approval from editorial.
```

Claude calls `request_approval` on the Approvals MCP. This:

- Creates an approval record in `approvals` collection
- Resolves the `editorial` group to actual users via your `groupResolver`
- Fires `approval/requested` on Inngest
- The Email plugin's `notify-approval-request` worker sends each approver an email with three signed action buttons (approve / decline / request changes)

In your Inngest dev dashboard (http://localhost:8288), you'll see the workflow run.

## 6. Decide via email

The approval email contains three URLs of the shape:

```
http://localhost:3000/api/approvals/decision?token=<HMAC-signed>&action=approve
```

Click "Approve." Without logging in, the approval record updates and the page becomes publishable. Ask Claude to publish again — this time the approval gate passes.

If you'd rather decide from chat:

```
Approve the latest approval request for the About us page.
```

Claude calls `decide_approval` and the same thing happens.

## What just happened

You exercised every layer of Throughline's trust boundary in one session:

- Composition validation (drafting)
- Required-field gate (first publish attempt)
- Approval gate (second publish attempt)
- Tokenized email decisions (no-login approver UX)
- Audit log capturing every step

If any of those gates had stayed in the way, you would not have been able to publish — including by going through the Payload admin UI. That's deliberate. See [The trust boundary](../concepts/the-trust-boundary.md) for why this design exists and how to extend it.

## Next

[Deploying to Vercel](deploying-to-vercel.md) walks through getting this same setup running in production.
