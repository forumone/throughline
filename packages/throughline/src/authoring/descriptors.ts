import type { McpToolDescriptor } from '../mcp/collector.js'

/*
The authoring surface: what an MCP client is offered for drafting and
publishing content. forumone-2026#830, throughline#302.

Eight tools in place of the forty-odd the modules each publish. They are shaped
by the job — find something, read it, draft it, check it, publish it — rather
than by which module implements each step, and each is a thin wrapper over the
module tools it replaces, so no behaviour moved. Those module tools still exist;
they are built into a collector `plugin-mcp` never sees, and these call their
handlers. See `surface.ts`.
*/

export const AUTHORING_TOOLS = {
  find: {
    name: 'find',
    description:
      'Finds content to work on or link to. With a query across every content type, or within one `collection`. With `kind` to find something to link or attach instead (a person, an image, a tag). With `mine` for your own unpublished drafts and scheduled publishes. Results carry the id `get`, `save_draft` and `publish` take.',
  },
  get: {
    name: 'get',
    description:
      'Reads content. With `collection` and `id`: the document, in the shape `save_draft` takes, with its admin and preview links; `versions` adds its recent versions, for a rollback. With only `collection`: what you can write to that content type — every field, its limits, the blocks each blocks field accepts and what publishing it requires. With neither: the content types there are.',
  },
  saveDraft: {
    name: 'save_draft',
    description:
      'Saves a draft. Without `id` it creates one: a new document from `data`, with a slug made from the title if none is given. With `id` it changes only the fields in `data` (a group is merged, an array or blocks field is replaced) and leaves the published version alone. Never publishes. Rich text takes { markdown } or { html }. Returns the id and a preview link.',
  },
  editBlocks: {
    name: 'edit_blocks',
    description:
      'Changes the blocks in one blocks field of a draft — `layout`, or e.g. `approach.blocks` — without resending the rest: insert, update, move and remove, as a list applied in order and saved together. Every new or changed block is checked against what the field accepts, its own validation and the composition rules first; if any check fails, nothing is saved. Block ids come from `get`.',
  },
  check: {
    name: 'check',
    description:
      'Whether a document would publish right now, without publishing it: every check `publish` makes, with all the blockers at once so they can be fixed together, and the preview link a person opens to see the draft (signed in). Run it before offering to publish.',
  },
  publish: {
    name: 'publish',
    description:
      'Takes a document live, or changes what is live. `action`: "now" publishes the current draft; "schedule" publishes it at `at`; "unpublish" takes it down; "rollback" restores an earlier version (`versionId`, from `get` with `versions`) as the draft; "request_approval" asks approvers to sign it off. Publishing needs an editor or admin, and a document whose policy requires approval cannot go live until it is granted: "now" says so, and files the request itself if `approval` is given. Always confirm with the person first.',
  },
  designGuide: {
    name: 'design_guide',
    description:
      "The design system, for choosing and filling blocks. With `intent`: the components that suit what the person wants, ranked, with reasons. With `component`: that component's full contract — its fields, variants, composition rules, accessibility and anti-examples. With `recipes`: what a composed section may be built from. With none: every component, by category.",
  },
  composeSection: {
    name: 'compose_section',
    description:
      "For a section no component fits: checks a composed section's recipe (its contract and tree of primitives and inline components) against the design system, or with `save` saves it as a draft recipe. A person must approve a recipe before a page using it can publish; you cannot. Ask `design_guide` with `recipes` for the building blocks first.",
  },
} as const satisfies Record<string, McpToolDescriptor>

export const AUTHORING_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(AUTHORING_TOOLS)

/**
 * The module tools that stay on the server, behind the admin-only check:
 * operations an administrator asks about, and none an author needs. A key sees
 * them only when an admin ticks them. Named rather than computed, so a module
 * that grows a tool does not quietly put it in front of authors or admins.
 */
export const OPS_TOOL_NAMES: readonly string[] = [
  // audit
  'query_audit',
  'get_change_history',
  'who_changed_what',
  'what_changed_in_range',
  'get_recent_failures',
  // integrations
  'list_integrations',
  'get_integration_status',
  'trigger_sync',
  'test_integration',
  'list_integration_types',
  // observability
  'list_job_failures',
  // approvals, beyond requesting one
  'respond_to_approval',
  'get_approval_status',
  'list_pending_approvals',
  'list_my_requests',
  // editorial overviews
  'get_content_calendar',
  'find_content_needing_attention',
  // references
  'find_references',
  'can_delete',
]
