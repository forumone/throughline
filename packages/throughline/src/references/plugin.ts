import type { Block, CollectionConfig, Config, Field, Plugin } from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolCollector } from '../mcp/collector.js'
import { refuseDeleteWhileReferenced, refuseTrashWhileReferenced } from './guards.js'
import {
  REFERENCE_TOOL_DESCRIPTORS,
  createCanDeleteTool,
  createFindReferencesTool,
} from './tools.js'

export interface ReferenceCollectionOptions {
  /** The collection to guard: deletes and trashing are refused while anything references a document. */
  slug: string
  /** What a document is called in the refusal: "file", "person", "term". */
  noun?: string
  /** What deleting would do to the documents that use it, appended to the refusal. */
  consequence?: string
  /** Add the "Used on" sidebar panel. Default `true`. */
  panel?: boolean
}

export interface ReferencesPluginOptions {
  enabled?: boolean
  /** The collections to guard, and whether each gets the panel. */
  collections: readonly ReferenceCollectionOptions[]
  /**
   * Blocks to resolve by slug beyond the config's `blocks` registry. A
   * `blocks` field's own blocks are always used, so this is rarely needed.
   */
  blocks?: readonly Block[]
  /** Where `find_references` and `can_delete` go. Omit for no MCP tools. Must come before `mcpPlugin`. */
  mcpTools?: McpToolCollector
  /** Who may call the tools. Default: a user with the `admin` or `editor` role. */
  canUse?: (ctx: McpToolContext) => boolean
}

/** The panel's import-map path. */
export const USED_ON_PANEL_PATH = '@forumone/throughline/rsc#UsedOnPanel'

/** The name of the panel's `ui` field. */
export const USED_ON_FIELD = 'usedOn'

/**
 * Reference tracking: what uses a document, refusing to delete or trash it
 * while anything does, a "Used on" panel, and the `find_references` and
 * `can_delete` MCP tools.
 *
 * Works with blocks stored as JSON, which Payload cannot query: see
 * `references/find.ts` for how, and for what it costs.
 *
 * ```ts
 * referencesPlugin({
 *   collections: [
 *     { slug: 'media', noun: 'file' },
 *     { slug: 'people', noun: 'person', panel: false },
 *   ],
 *   mcpTools,
 * })
 * ```
 */
export function referencesPlugin(options: ReferencesPluginOptions): Plugin {
  return (incoming: Config): Config => {
    if (options.enabled === false) return incoming

    const bySlug = new Map(options.collections.map((entry) => [entry.slug, entry]))
    const known = new Set((incoming.collections ?? []).map((collection) => collection.slug))
    const missing = [...bySlug.keys()].filter((slug) => !known.has(slug))
    if (missing.length > 0) {
      throw new Error(
        `referencesPlugin: no collection ${missing.map((slug) => `"${slug}"`).join(', ')} in the config. ` +
          `Register this plugin after the plugins that add collections it guards.`,
      )
    }

    const collections = (incoming.collections ?? []).map((collection): CollectionConfig => {
      const entry = bySlug.get(collection.slug)
      if (!entry) return collection

      const guard = {
        ...(entry.noun ? { noun: entry.noun } : {}),
        ...(entry.consequence ? { consequence: entry.consequence } : {}),
        ...(options.blocks ? { blocks: options.blocks } : {}),
      }

      let fields = collection.fields
      if (entry.panel !== false) {
        if (fields.some((field) => 'name' in field && field.name === USED_ON_FIELD)) {
          throw new Error(
            `referencesPlugin: "${collection.slug}" already has a field named "${USED_ON_FIELD}". ` +
              `Remove it, or pass panel: false.`,
          )
        }
        /*
        A `ui` field stores nothing. First, so it sits at the top of the
        sidebar: an editor about to change an image needs to know it is on five
        pages before they change it.
        */
        const panel: Field = {
          name: USED_ON_FIELD,
          type: 'ui',
          admin: { position: 'sidebar', components: { Field: USED_ON_PANEL_PATH } },
          ...(options.blocks ? { custom: { references: { blocks: options.blocks } } } : {}),
        }
        fields = [panel, ...fields]
      }

      return {
        ...collection,
        fields,
        hooks: {
          ...collection.hooks,
          // First in each list, so a refusal happens before any other hook acts.
          beforeChange: [
            refuseTrashWhileReferenced(collection.slug, guard),
            ...(collection.hooks?.beforeChange ?? []),
          ],
          beforeDelete: [
            refuseDeleteWhileReferenced(collection.slug, guard),
            ...(collection.hooks?.beforeDelete ?? []),
          ],
        },
      }
    })

    // Declared at config time so `mcpPlugin` makes a checkbox per tool; bound at `onInit`.
    options.mcpTools?.declare(REFERENCE_TOOL_DESCRIPTORS, { serverName: 'references' })

    return {
      ...incoming,
      collections,
      onInit: async (payload) => {
        if (incoming.onInit) await incoming.onInit(payload)
        if (!options.mcpTools) return

        const deps = {
          payload,
          guarded: new Map(
            options.collections.map((entry) => [
              entry.slug,
              {
                ...(entry.noun ? { noun: entry.noun } : {}),
                ...(entry.consequence ? { consequence: entry.consequence } : {}),
              },
            ]),
          ),
          ...(options.blocks ? { blocks: options.blocks } : {}),
          ...(options.canUse ? { canUse: options.canUse } : {}),
        }
        options.mcpTools.add(
          [
            createFindReferencesTool(deps),
            createCanDeleteTool(deps),
          ] as unknown as McpToolDefinition[],
          { serverName: 'references' },
        )
      },
    }
  }
}
