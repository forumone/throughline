---
'@forumone/throughline-publishing': minor
---

Ship the admin Publish/Unpublish controls and a server-side publishing API.

`publishingPlugin` blocked direct writes to `_status` — which is what Payload's native Publish button submits — but shipped no replacement, so no document in a publishable collection could be published from the admin. The pipeline was reachable only over the MCP endpoint, which requires an API key.

- **Admin controls.** The plugin now installs its own `PublishButton` and `UnpublishButton` on every configured collection, exported from `@forumone/throughline-publishing/client`. They run the pipeline as the logged-in editor over the session cookie — no API key, correct audit attribution — and render the failing step, its issues and its suggestion instead of a generic error. Hosts must run `payload generate:importmap`. Opt out with `adminComponents: false`; an explicit host-set slot is never overwritten.
- **Server-side API.** `publishDocument`, `unpublishDocument`, `getPublishStatus` and `getPublishingService` are now public, for host code that needs to publish outside the admin.
- **Audit attribution.** Publishes are attributed to the user who made them rather than to the API key that transported the call. Admin publishes record `mcpTool: 'admin:publish'`.
- **Access control.** Admin and host-API publishes run the underlying write with `overrideAccess: false` as that user, so bypassing the status hook does not bypass collection permissions.
- **Diagnosis.** The status-write hook now throws `APIError(…, 400)` rather than `Error`, so the message reaches the admin instead of becoming a 500 and a generic "Something went wrong" toast.

The MCP tools now route through the same service as the admin path, so the two channels cannot drift. Their input and output shapes are unchanged.
