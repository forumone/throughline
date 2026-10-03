import { z } from 'zod'
import { findAuditWriter } from '../audit/plugin.js'
import type { CollectionSlug, Field, Payload, Plugin } from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolCollector, McpToolDescriptor } from '../mcp/collector.js'
import { deniedEnvelope } from '../mcp/envelope.js'
import { slugify, titleOf } from './slug.js'

/*
`check_slug`: the question an agent should ask before creating a document, and
the one `refuseSlugHeldInTrash` answers too late, at save. A slug is unique
across the whole collection, the trash included, so this reads past access
control: a draft the caller cannot see still holds its address. Only admins and
editors may ask by default, since the answer names the holder.
*/

export const FIELD_TOOLS = {
  checkSlug: {
    name: 'check_slug',
    description:
      'Whether a URL slug is free in a collection, before creating or renaming a document. Normalises it the way the slug field will (lowercase, hyphens, no accents), and if it is taken says by which document, including one in the trash, and suggests the first free alternative.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const FIELD_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(FIELD_TOOLS)

const inputSchema = z.object({
  collection: z.string().describe('The collection slug, e.g. "pages".'),
  slug: z.string().min(1).describe('The slug, or a title to make one from.'),
})

/** Whether a field tree has a top-level `slug` field, looking through unnamed wrappers. */
export function hasSlugField(fields: readonly Field[]): boolean {
  for (const field of fields) {
    if ('name' in field && field.name === 'slug') return true
    if (!('name' in field) || typeof field.name !== 'string') {
      if (
        field.type === 'tabs' &&
        field.tabs.some((tab) => !('name' in tab) && hasSlugField(tab.fields))
      ) {
        return true
      }
      if ('fields' in field && Array.isArray(field.fields) && hasSlugField(field.fields))
        return true
    }
  }
  return false
}

function defaultCanUse(ctx: McpToolContext): boolean {
  const roles = ctx.user?.roles ?? []
  return roles.includes('admin') || roles.includes('editor')
}

async function holderOf(
  payload: Payload,
  collection: CollectionSlug,
  slug: string,
  trash: boolean,
) {
  const { docs } = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    ...(trash ? { trash: true } : {}),
  })
  return docs[0] as Record<string, unknown> | undefined
}

/** The answer, for the tool and for a host that wants it directly. */
export async function checkSlug(payload: Payload, collection: CollectionSlug, input: string) {
  const config = payload.collections[collection]?.config
  const trash = Boolean(config && 'trash' in config && config.trash)
  const slug = slugify(input)
  if (slug === '')
    return { collection, slug, available: false, reason: 'Nothing is left once it is a slug.' }

  const holder = await holderOf(payload, collection, slug, trash)
  if (!holder) return { collection, slug, available: true }

  let suggestion: string | undefined
  for (let n = 2; n <= 20 && !suggestion; n += 1) {
    const candidate = `${slug}-${n}`
    if (!(await holderOf(payload, collection, candidate, trash))) suggestion = candidate
  }
  return {
    collection,
    slug,
    available: false,
    takenBy: {
      id: holder['id'] as number | string,
      title: titleOf(holder),
      trashed: Boolean(holder['deletedAt']),
    },
    ...(suggestion ? { suggestion } : {}),
  }
}

export function createCheckSlugTool(deps: {
  payload: Payload
  canUse?: (ctx: McpToolContext) => boolean
}): McpToolDefinition<typeof inputSchema> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...FIELD_TOOLS.checkSlug,
    inputSchema,
    handler: async (input, ctx) => {
      if (!canUse(ctx)) return deniedEnvelope('Only admins and editors can check slugs.')
      const config = deps.payload.collections[input.collection as CollectionSlug]?.config
      if (!config) return { error: `There is no collection "${input.collection}".` }
      if (!hasSlugField(config.fields)) return { error: `"${input.collection}" has no slug field.` }
      return checkSlug(deps.payload, input.collection as CollectionSlug, input.slug)
    },
  }
}

/**
 * The field kit's MCP tool. The fields themselves are plain functions a
 * collection calls, and the character counter is `characterCountPlugin`, which
 * has to run last; this only binds `check_slug`, and like every tool-bearing
 * plugin must come before `mcpPlugin`.
 */
export function fieldsPlugin(options: {
  mcpTools?: McpToolCollector
  canUse?: (ctx: McpToolContext) => boolean
}): Plugin {
  return (incoming) => {
    options.mcpTools?.declare(FIELD_TOOL_DESCRIPTORS, { serverName: 'fields' })
    return {
      ...incoming,
      onInit: async (payload) => {
        if (incoming.onInit) await incoming.onInit(payload)
        options.mcpTools?.add(
          [
            createCheckSlugTool({ payload, ...(options.canUse ? { canUse: options.canUse } : {}) }),
          ] as unknown as McpToolDefinition[],
          { serverName: 'fields', ...(findAuditWriter(payload) ? { audit: findAuditWriter(payload)! } : {}) },
        )
      },
    }
  }
}
