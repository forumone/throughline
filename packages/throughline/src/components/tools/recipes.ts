import { z } from 'zod'
import { MAX_DEPTH, MAX_NODES, lintRecipe } from '@forumone/throughline-design-system/recipes'
import { ValidationError, type CollectionSlug, type Payload, type PayloadRequest } from 'payload'
import type { AuditWriter } from '../../audit/writer.js'
import { auditContext } from '../../mcp/audit-context.js'
import type { McpToolDescriptor } from '../../mcp/collector.js'
import { deniedEnvelope } from '../../mcp/envelope.js'
import { withMeta } from '../../mcp/meta.js'
import type { McpToolContext, McpToolDefinition } from '../../plugin-contract/mcp.js'
import type { ManifestLoader } from '../manifest-source.js'

/*
The tools for composing a section the design system does not have
(forumone-2026#801): what a recipe may be made of, whether one passes, and
saving one as a draft.

A recipe is linted against the manifest as it is now on every one of these,
so `validate_recipe` is the loop an agent runs until the errors are gone, and
`save_recipe` refuses what it would refuse. Saving never approves: a person
does that in the admin, once, and only then can a page using the recipe go
live.
*/

export const RECIPE_TOOLS = {
  getRecipeVocabulary: {
    name: 'get_recipe_vocabulary',
    description:
      'What a composed section (a recipe) may be made of: every primitive — layouts with their slots, content pieces with the kind of field they show — with the exact values each prop allows; the components that may be placed inside a section, with their fields and variants; and the rules a recipe is held to. Read this before writing one.',
  },
  validateRecipe: {
    name: 'validate_recipe',
    description:
      'Checks a recipe — { contract, tree } — against the design system as it is now, without saving it. Returns every problem with its path in the tree and what to do instead. Run it until it returns none, then save_recipe.',
  },
  saveRecipe: {
    name: 'save_recipe',
    description:
      'Saves a recipe as a draft, or updates a draft one by id. Refused if it does not pass validate_recipe, or if the recipe is approved (an approved recipe does not change: save a new one). A person approves it in the admin; until then no page using it can be published.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const RECIPE_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(RECIPE_TOOLS)

export interface RecipeToolDeps {
  payload: Payload
  loader: ManifestLoader
  auditWriter: AuditWriter
  /** The collection recipes are saved in. */
  collection: string
  /** Who may save. Default: a user with the `admin` or `editor` role. */
  canUse?: (ctx: McpToolContext) => boolean
}

const recipeShape = {
  contract: z
    .record(z.string(), z.unknown())
    .describe('The provisional component contract: name, intent, content.fields, antiExamples…'),
  tree: z
    .record(z.string(), z.unknown())
    .describe('The root node, usually { primitive: "Section", slots: { children: [...] } }.'),
}

function editorOrAdmin(ctx: McpToolContext): boolean {
  const roles = ctx.user?.roles ?? []
  return roles.includes('admin') || roles.includes('editor')
}

export function createGetRecipeVocabularyTool(deps: Pick<RecipeToolDeps, 'loader'>): McpToolDefinition {
  return {
    ...RECIPE_TOOLS.getRecipeVocabulary,
    inputSchema: z.object({}),
    handler: async () => {
      const manifest = (await deps.loader.get()).raw
      const components = Object.values(manifest.components)
        .filter((c) => c.composition.placement.includes('inline'))
        .map((c) => ({
          name: c.name,
          description: c.description,
          fields: c.content.fields.map((f) => ({ name: f.name, type: f.type, required: f.required })),
          ...(c.content.variants?.length ? { variants: c.content.variants.map((v) => v.name) } : {}),
        }))
      return {
        primitives: Object.values(manifest.primitives ?? {}),
        components,
        rules: [
          'The root is a layout primitive, usually Section.',
          'A primitive node is { primitive, props?, slots?, content? }; a component node is { component, fields }.',
          'Every word comes from one of the contract’s content fields: bind it with { field: "<name>" }. Every declared field must be shown.',
          'A prop takes only a value its primitive lists. A component field may be a literal only if it is a boolean, or a select whose value is one of the component’s variants.',
          'Headings start at level 2 and do not skip a level. An image field is required.',
          `At most ${MAX_DEPTH} levels deep and ${MAX_NODES} nodes.`,
          'The contract’s placement is ["section"], its intent at least 50 characters, and it has at least one anti-example.',
        ],
      }
    },
  }
}

export function createValidateRecipeTool(
  deps: Pick<RecipeToolDeps, 'loader' | 'auditWriter'>,
): McpToolDefinition {
  const inputSchema = withMeta(recipeShape)
  return {
    ...RECIPE_TOOLS.validateRecipe,
    inputSchema,
    handler: async (input, ctx) => {
      const issues = lintRecipe(
        { contract: input.contract, tree: input.tree },
        (await deps.loader.get()).raw,
      )
      await deps.auditWriter({
        ...auditContext(ctx, input._meta),
        action: 'design.validate',
        mcpServer: 'component',
        mcpTool: RECIPE_TOOLS.validateRecipe.name,
      })
      return { valid: !issues.some((i) => i.severity === 'error'), issues }
    },
  }
}

export function createSaveRecipeTool(deps: RecipeToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    ...recipeShape,
    id: z
      .union([z.string(), z.number()])
      .optional()
      .describe('A draft recipe to update. Omit to save a new one.'),
  })
  const canUse = deps.canUse ?? editorOrAdmin
  return {
    ...RECIPE_TOOLS.saveRecipe,
    inputSchema,
    requiredScope: 'content.write',
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return deniedEnvelope('This key is not tied to a person, and a recipe is saved as a person.')
      }
      if (!canUse(ctx)) return deniedEnvelope('Only admins and editors can save recipes.')

      const issues = lintRecipe(
        { contract: input.contract, tree: input.tree },
        (await deps.loader.get()).raw,
      ).filter((i) => i.severity === 'error')
      if (issues.length > 0) {
        return { error: `The recipe has ${issues.length} problem(s). Nothing was saved.`, issues }
      }

      const user = ctx.user as unknown as PayloadRequest['user']
      const data = { contract: input.contract, tree: input.tree }
      let doc: Record<string, unknown>
      try {
        doc = (
          input.id === undefined
            ? await deps.payload.create({
                collection: deps.collection as CollectionSlug,
                data: data as never,
                overrideAccess: false,
                user,
              })
            : await deps.payload.update({
                collection: deps.collection as CollectionSlug,
                id: input.id,
                data: data as never,
                overrideAccess: false,
                overrideLock: false,
                user,
              })
        ) as unknown as Record<string, unknown>
      } catch (error) {
        if (error instanceof ValidationError) {
          return {
            error: error.message,
            fields: (error.data?.errors ?? []).map((e) => ({ field: e.path, message: e.message })),
          }
        }
        const status = (error as { status?: unknown } | null)?.status
        if (status === 403 || status === 404 || status === 423) return { error: (error as Error).message }
        throw error
      }

      const id = doc['id'] as number | string
      await deps.auditWriter({
        ...auditContext(ctx, input._meta),
        action: input.id === undefined ? 'content.create' : 'content.update',
        mcpServer: 'component',
        mcpTool: RECIPE_TOOLS.saveRecipe.name,
        targetCollection: deps.collection,
        targetId: String(id),
        targetTitle: typeof doc['name'] === 'string' ? doc['name'] : undefined,
      })
      return {
        id,
        name: doc['name'],
        status: doc['status'] ?? 'draft',
        adminUrl: `${deps.payload.config.routes.admin}/collections/${deps.collection}/${encodeURIComponent(String(id))}`,
        next: 'A person approves the recipe in the admin. Until then a page can use it in a draft, but not publish.',
      }
    },
  }
}
