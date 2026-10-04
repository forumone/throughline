import type { McpToolContext } from '../plugin-contract/index.js'
import type { McpToolCollector } from '../mcp/collector.js'

/*
What a site tells the content tools about each collection an agent may write.

The tools are generic and the content model is not, so everything here is
something only the site knows. What the site does not have to say, the tools
read from the live config: field types, limits, required, the options of a
select, which collection a relationship points at, and which blocks a blocks
field offers — its `filterOptions` — so the answer cannot drift from what the
admin enforces.
*/

export interface ContentCollectionOptions {
  /**
   * The top-level fields an author may set, by name: what an agent is told
   * about and, from phase 2, what a write may contain. A group or an array is
   * named whole. Fields inside tabs and collapsibles are named directly, as
   * they are stored.
   *
   * An allow-list rather than a deny-list: a field added to the collection
   * later is not writable over MCP until somebody decides it should be.
   */
  fields: readonly string[]
  /**
   * Blocks the collection's template already draws from the document's own
   * fields, so an agent does not repeat them in `layout`. By slug. A blocks
   * field's `filterOptions` already keeps the ones that may appear only once
   * out of the picker; this says why, and covers those that may repeat.
   */
  templateDraws?: readonly string[]
  /** What publishing this collection requires beyond its fields, in the words an agent reads. */
  publishRequires?: readonly string[]
  /**
   * How to turn Markdown or HTML into each rich-text field's editor state, by
   * field name. A field with no converter takes an editor state only. The
   * converter is the site's, because what a body may hold — which nodes the
   * editor has, which embeds become blocks — is the site's.
   */
  richText?: Readonly<Record<string, RichTextConverter>>
}

/** What an agent sends a rich-text field instead of an editor state. */
export type RichTextSource = { markdown: string } | { html: string }

/**
 * Converts one rich-text value. `refused` when the conversion would lose
 * something — text, structure, an embed the body cannot hold — with what and
 * where, so the agent can change its input rather than lose content silently.
 */
export type RichTextConverter = (
  source: RichTextSource,
) => Promise<{ state: unknown } | { refused: string; details?: unknown }>


export interface RelatedKindOptions {
  /** The collection a kind searches. */
  collection: string
  /** Fields a lookup may also match on exactly, e.g. a taxonomy's `type`. */
  filters?: readonly string[]
  /**
   * Fields the query is matched against, OR'd. Default: the collection's
   * `useAsTitle`. For media, whose title is usually a filename, add `alt`.
   */
  searchFields?: readonly string[]
  /** What the kind is, for the tool's description. */
  description?: string
}

export interface ContentPluginOptions {
  enabled?: boolean
  /** The collections the tools read and write, by slug. */
  collections: Readonly<Record<string, ContentCollectionOptions>>
  /**
   * What `find_related` looks up, by the name an agent passes as `kind`:
   * `{ people: { collection: 'people' }, media: { collection: 'media' } }`.
   * An upload collection's results carry the file's alt text and dimensions.
   */
  related?: Readonly<Record<string, RelatedKindOptions>>
  /** Where the tools go. Omit for none. Must come before `mcpPlugin`. */
  mcpTools?: McpToolCollector
  /** Who may call them. Default: a user with the `admin` or `editor` role. */
  canUse?: (ctx: McpToolContext) => boolean
  /**
   * The block type a composed section is stored as (forumone-2026#801). The
   * write tools' composition check keeps it in the order without checking it
   * as a component; the publish gate checks its recipe. `throughline()` sets it
   * from its `recipes` option.
   */
  composedBlockType?: string
}
