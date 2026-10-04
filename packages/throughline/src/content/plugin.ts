import type { CollectionConfig, Config, Plugin } from 'payload'
import { findAuditWriter } from '../audit/plugin.js'
import { unknownFieldNames } from './describe.js'
import type { ContentPluginOptions } from './options.js'
import { CONTENT_READ_TOOL_DESCRIPTORS, createContentReadTools } from './tools.js'
import { CONTENT_WRITE_TOOL_DESCRIPTORS, createContentWriteTools } from './write.js'
import { CONTENT_BLOCK_TOOL_DESCRIPTORS, createContentBlockTools } from './blocks.js'

/**
 * The content tools: what an agent reads before it writes a draft, and — in
 * the phases that follow — the drafts themselves. forumone-2026#803.
 *
 * Checks its options against the finished config at boot, so a misspelt field
 * or a collection that was renamed stops the boot rather than quietly leaving
 * an agent unable to set something:
 *
 * ```ts
 * contentPlugin({
 *   collections: {
 *     pages: { fields: ['title', 'slug', 'layout', 'meta'] },
 *     posts: { fields: ['title', 'slug', 'intro', 'body', 'authors'], templateDraws: ['ArticleBody'] },
 *   },
 *   related: { people: { collection: 'people' }, media: { collection: 'media' } },
 *   mcpTools,
 * })
 * ```
 */
export function contentPlugin(options: ContentPluginOptions): Plugin {
  return (incoming: Config): Config => {
    if (options.enabled === false) return incoming

    // Declared at config time so `mcpPlugin` makes a checkbox per tool; bound at `onInit`.
    options.mcpTools?.declare(
      [
        ...CONTENT_READ_TOOL_DESCRIPTORS,
        ...CONTENT_WRITE_TOOL_DESCRIPTORS,
        ...CONTENT_BLOCK_TOOL_DESCRIPTORS,
      ],
      { serverName: 'content' },
    )

    return {
      ...incoming,
      onInit: async (payload) => {
        if (incoming.onInit) await incoming.onInit(payload)
        assertContentOptions(
          options,
          Object.values(payload.collections).map((collection) => collection.config),
        )
        if (!options.mcpTools) return
        const audit = findAuditWriter(payload)
        const deps = {
          payload,
          collections: options.collections,
          related: options.related ?? {},
          ...(options.canUse ? { canUse: options.canUse } : {}),
        }
        options.mcpTools.add(
          [
            ...createContentReadTools(deps),
            ...createContentWriteTools({ ...deps, ...(audit ? { audit } : {}) }),
            ...createContentBlockTools({ ...deps, ...(audit ? { audit } : {}) }),
          ],
          { serverName: 'content', ...(audit ? { audit } : {}) },
        )
      },
    }
  }
}

/*
Against the finished config rather than the one this plugin is handed, because
a field named here may come from a plugin that runs later — `@payloadcms/plugin-seo`
adds its `meta` group after the suite has run.
*/
export function assertContentOptions(
  options: Pick<ContentPluginOptions, 'collections' | 'related'>,
  collections: readonly Pick<CollectionConfig, 'slug' | 'fields'>[],
): void {
  const bySlug = new Map(collections.map((collection) => [collection.slug, collection]))
  const problems: string[] = []
  for (const [slug, entry] of Object.entries(options.collections)) {
    const collection = bySlug.get(slug)
    if (!collection) {
      problems.push(`no collection "${slug}"`)
      continue
    }
    const unknown = unknownFieldNames(collection.fields, entry.fields)
    if (unknown.length > 0) {
      problems.push(`"${slug}" has no top-level field ${unknown.map((n) => `"${n}"`).join(', ')}`)
    }
  }
  for (const [kind, entry] of Object.entries(options.related ?? {})) {
    if (!bySlug.has(entry.collection)) {
      problems.push(`related kind "${kind}" names no collection "${entry.collection}"`)
    }
  }
  if (problems.length > 0) {
    throw new Error(`contentPlugin: ${problems.join('; ')}. Name fields as they are stored.`)
  }
}
