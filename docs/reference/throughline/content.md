# Content tools

`@forumone/throughline/content` gives an agent the MCP tools it uses to write drafts of a site's content types. This release has the read half, which the agent uses before it writes anything. The write tools come next: `create_draft`, `update_draft` and operations on individual blocks.

Turn it on through `throughline()`:

```ts
throughline({
  // …
  content: {
    collections: {
      pages: { fields: ['title', 'slug', 'layout', 'meta'] },
      posts: {
        fields: ['title', 'slug', 'intro', 'heroImage', 'body', 'authors', 'topics', 'layout', 'meta'],
        templateDraws: ['IntroSection', 'ArticleBody', 'HighImpactCTA'],
      },
    },
    related: {
      people: { collection: 'people' },
      media: { collection: 'media' },
      topics: { collection: 'taxonomy-terms', filters: ['type'] },
    },
  },
})
```

## What the site says, and what it doesn't have to

- **`fields`** lists the top-level fields an author may set, by the name they are stored under. A group or an array is named whole. It's an allow-list: a field added to the collection later can't be written over MCP until someone adds it here. A misspelt name stops the boot.
- **`templateDraws`** lists the blocks the page template already renders from the document's own fields, so the agent doesn't repeat them in `layout`.
- **`related`** lists the things a document links to, by the `kind` the agent passes to `find_related`. A kind can allow exact filters, such as a taxonomy's `type`. An upload collection's results include alt text and dimensions.

Everything else comes from the live config. That includes field types, limits, whether a field is required, a select's options and a relationship's target. A blocks field's allowed blocks come from its own `filterOptions`, the same function the admin's block picker calls. When `publishing` is on, `throughline()` adds what its required-fields step asks for: the SEO title and description, the slug, and any `requiredFields`.

## Tools

| Tool | What it does |
| --- | --- |
| `describe_content_type` | Lists the fields an author may set, the blocks each blocks field accepts, what the template draws, and what publishing requires |
| `find_documents` | Searches by title or slug, drafts included, newest first, and returns the id, status, and admin and preview links |
| `find_related` | Looks up an author, client, term or image by name, to get the id a field needs |
| `get_document` | Returns one document, the latest draft by default, in the shape the write tools accept |

Every call runs as the person the API key belongs to, with `overrideAccess: false`. A key with nobody behind it is refused, and so is anyone without the `admin` or `editor` role, unless the site passes its own `canUse`.

## Upgrading: a migration

Two things change the database:

- The audit log's `mcpServer` select gains `content`, which on Postgres is a new value on `enum_audit_events_mcp_server`.
- `@payloadcms/plugin-mcp` adds one checkbox column per tool to its key collection.

Run `migrate:create` (with `BLOB_READ_WRITE_TOKEN` set if you use the storage plugin) and apply the migration before deploying.
