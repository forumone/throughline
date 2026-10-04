# Content tools

`@forumone/throughline/content` gives an agent the MCP tools it uses to write drafts of a site's content types. There are read tools, which an agent uses before it writes anything, tools that write drafts, and tools that change one block at a time.

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
| `create_draft` | Creates a new draft. A slug is made from the title when none is given |
| `update_draft` | Changes some fields of a draft and leaves the rest. A group is merged; an array or a blocks field is replaced whole |

| `insert_block` | Adds a block to a blocks field (at the start, at the end, or after a given block) and returns its new id |
| `update_block` | Changes fields of one block by id. A group inside the block is merged, and the block's type can't change |
| `move_block` | Moves a block to the start, to the end, or after another block |
| `remove_block` | Removes a block by id |

A blocks field is named by its path: `layout`, or `approach.blocks` for one inside an allow-listed group. A block operation reads the current draft and makes one change. Before saving, it checks the new or changed block against the blocks the field offers and against the block's own validation (each field's `validate`, called as Payload calls it on a full save), and checks the whole field against the composition rules. It then saves the draft the same way `update_draft` does.

### What a write may not do

- **Publish.** Every write is `draft: true`, and `_status`, `publishedAt` and `scheduledPublishAt` are refused. A document goes live only through `publish`, `schedule_publish` or `request_approval`, with the same gates an editor's publish goes through.
- **Set a field off the allow-list.** This includes the approval `policy`, so an agent can't lower a document's approval requirement. The refusal says why for each field.
- **Overwrite somebody's work.** While anyone has the document open in the admin, writes are refused and the refusal names them. That includes the key's own person: their open tab autosaves every couple of seconds, and a Payload update deletes the lock it finds, so their tab wouldn't even notice.
- **Add a block the field doesn't offer, or break the composition rules.** A draft save skips Payload's field validation, in the admin and through the Local API alike, so these two checks from the block picker are made explicitly. The blocks come from the field's `filterOptions` (so blocks a document already holds stay allowed), and composition uses the same validator the publish pipeline runs. Required fields are checked at publish, as they are for an editor.
- **Take a slug that's in use**, including one held by a document in the trash. The refusal suggests a free one.

Every write is recorded in the audit log as `content.create` or `content.update`, under the person's name, with the caller's `_meta`: `userPrompt`, `reasoning` and `changesSummary`.

Every call runs as the person the API key belongs to, with `overrideAccess: false`. A key with nobody behind it is refused, and so is anyone without the `admin` or `editor` role, unless the site passes its own `canUse`.

## Upgrading: a migration

Two things change the database:

- The audit log's `mcpServer` select gains `content`, which on Postgres is a new value on `enum_audit_events_mcp_server`.
- `@payloadcms/plugin-mcp` adds one checkbox column per tool to its key collection.

Run `migrate:create` (with `BLOB_READ_WRITE_TOKEN` set if you use the storage plugin) and apply the migration before deploying.
