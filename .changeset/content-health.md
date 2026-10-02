---
'@forumone/throughline-publishing': minor
---

Adds content health, moved from forumone-2026: an admin view of what needs a review, a dashboard summary, and the `find_content_needing_attention` MCP tool, all from one read, so an editor and an agent see the same rows. Additive.

- `editorialPlugin({ health: { checks }, mcpTools })`, from `@forumone/throughline-publishing/editorial`, registers the view at `/admin/content-health` and binds the tool.
- The rules are checks a site configures, not hard-coded lists:
  - `staleCheck({ after: { pages: 12 } })`: published documents not revised within a threshold, dated by the first of `revisedAt`, `publishedAt` and `createdAt`.
  - `missingSeoCheck({ collections })`: published, indexable documents with no meta description or image. It uses the SEO plugin's field names by default.
  - `missingAltCheck({ inUse: findReferencedIds })`: images in use without alt text.
  - A custom `HealthCheck` is a `where` per collection, so each count links to the admin list it counted.
- `findContentNeedingAttention(payload, { checks, user })` is the read behind all three. It runs as the person asking. A check that cannot run reports `failed` rather than nothing found.
- `ContentHealthView` and `HealthSummary` are server components at `@forumone/throughline-publishing/rsc`. They carry their own styles in Payload's tokens. `next` and `@payloadcms/next` are new optional peers, needed only by that subpath.

The tool adds a checkbox to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.
