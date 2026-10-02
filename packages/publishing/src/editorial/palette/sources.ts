import type { Where } from 'payload'
import { whereQuery } from '../health/checks.js'

/*
What the command palette searches, and the pure half of how. From
forumone-2026's `admin/palette/sources.ts` (#760 there), with its list of
collections made an option.

No index. The palette sends one small REST `find` per collection, in parallel,
and groups what comes back. At a few hundred documents that is a handful of
indexed `ILIKE`s per keystroke, with no table to keep in sync and no migration.
If it ever gets slow, `@payloadcms/plugin-search` is the next step.

**One query, two callers.** `searchWhere` is the query. The palette's REST URL is
written from it by `searchUrl`, and the `search_content` MCP tool runs it through
the Local API, so the browser and an agent ask the same question.
*/

export interface SearchSource {
  slug: string
  /** The field shown as the result's title. */
  titleField: string
  /** Fields matched against the query, OR'd. */
  searchFields: readonly string[]
  /** Whether the collection has drafts, so the latest draft's title is the one searched. */
  drafts: boolean
}

/** Results per collection. Enough to see the one you meant; the list view has the rest. */
export const PER_SOURCE = 5

/** The query for one source: any search field `like` what was typed. */
export function searchWhere(source: SearchSource, query: string): Where {
  const q = query.trim()
  return { or: source.searchFields.map((field) => ({ [field]: { like: q } })) }
}

function param(key: string, value: string | number | boolean): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
}

/**
 * The REST query for one source. Read with the viewer's own cookie, so access
 * control applies exactly as it does in the list view, and `select` keeps each
 * row to the one field shown.
 */
export function searchUrl(
  apiRoute: string,
  source: SearchSource,
  query: string,
  perSource = PER_SOURCE,
): string {
  const parts = [
    whereQuery(searchWhere(source, query)),
    param('limit', perSource),
    param('depth', 0),
    param(`select[${source.titleField}]`, true),
    param('sort', '-updatedAt'),
  ]
  if (source.drafts) parts.push(param('draft', true))
  return `${apiRoute}/${source.slug}?${parts.join('&')}`
}

/** The REST query for a set of documents by id, for the recent list. */
export function byIdsUrl(
  apiRoute: string,
  source: SearchSource,
  ids: readonly (number | string)[],
): string {
  const parts = [
    param('where[id][in]', ids.join(',')),
    param('limit', ids.length),
    param('depth', 0),
    param(`select[${source.titleField}]`, true),
  ]
  if (source.drafts) parts.push(param('draft', true))
  return `${apiRoute}/${source.slug}?${parts.join('&')}`
}

/**
 * How well a title matches: 0 exact, 1 prefix, 2 a word starts with it,
 * 3 anywhere. The database answers "does it match"; this orders what it
 * returned, so typing "about" puts "About" above "What we talk about".
 */
export function matchRank(title: string, query: string): number {
  const t = title.toLowerCase()
  const q = query.trim().toLowerCase()
  if (q === '') return 3
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  if (t.split(/[^a-z0-9]+/).some((word) => word.startsWith(q))) return 2
  return 3
}

export interface Command {
  id: string
  label: string
  /** What kind of thing it is, shown beside it: "Go to", "New", a collection label. */
  hint: string
  href: string
  /** Extra words it answers to. */
  keywords?: string
}

/** Commands whose label or keywords contain every word of the query, best match first. */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return commands
    .filter((command) => {
      const haystack = `${command.hint} ${command.label} ${command.keywords ?? ''}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
    .sort((a, b) => matchRank(a.label, query) - matchRank(b.label, query))
}

export interface RecentEntry {
  collection: string
  id: string
}

/** How many recently opened documents are remembered. */
export const RECENT_LIMIT = 6

/**
 * The document an admin path is the editor for, or `null`. A version or API
 * sub-view is still that document; a list, `create` or `trash` is not; and only
 * collections the palette searches are remembered.
 */
export function documentFromPath(
  pathname: string,
  adminRoute: string,
  searched: readonly string[],
): RecentEntry | null {
  const prefix = `${adminRoute}/collections/`
  if (!pathname.startsWith(prefix)) return null
  const [collection, id] = pathname.slice(prefix.length).split('/')
  if (!collection || !id || id === 'create' || id === 'trash') return null
  if (!searched.includes(collection)) return null
  return { collection, id: decodeURIComponent(id) }
}

/** `entry` moved to the front of `list`, de-duplicated and capped. */
export function pushRecent(list: readonly RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const rest = list.filter(
    (item) => !(item.collection === entry.collection && item.id === entry.id),
  )
  return [entry, ...rest].slice(0, RECENT_LIMIT)
}

/** A stored preference read defensively: anything that is not a list of entries is an empty list. */
export function readRecent(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is RecentEntry =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as RecentEntry).collection === 'string' &&
      typeof (item as RecentEntry).id === 'string',
  )
}

/** An admin screen that is not a collection, for the palette and the Reports nav. */
export interface Report {
  /** Under the admin route: `/content-health`. */
  path: string
  label: string
  /** Extra words the palette matches it by. */
  keywords?: string
}
