import { formatZodIssues } from '../utils/zod-issues.js'
import type { McpToolCollector } from '../mcp/collector.js'
import type { Inngest } from 'inngest'
import { z } from 'zod'
import type { BaseCorePluginOptions } from '../plugin-contract/index.js'

export interface PublishableCollection {
  /** Slug of the collection that can be published through this server. */
  slug: string
  /** Field name on the document holding composition blocks. Default: `'layout'`. */
  layoutField?: string
  /** Field name for the SEO group used by required-field checks. Default: `'seo'`. */
  seoField?: string
  /** Field name for the policy group (`requiresApproval`, `embargoedUntil`). Default: `'policy'`. */
  policyField?: string
  /** Field name for the slug. Default: `'slug'`. */
  slugField?: string
  /** Field name for the publish timestamp. Default: `'publishedAt'`. */
  publishedAtField?: string
  /** Field name for a future scheduled publish time. Default: `'scheduledPublishAt'`. */
  scheduledPublishField?: string
  /** Per-collection required fields beyond the built-in SEO/slug checks. */
  requiredFields?: Array<{ path: string; message: string }>
}

export interface AccessibilityIssue {
  field?: string | undefined
  message: string
  severity: 'error' | 'warning'
}

export interface AccessibilityCheck {
  name: string
  run: (
    doc: Record<string, unknown>,
    collection: ResolvedCollection,
  ) => Promise<AccessibilityIssue[]> | AccessibilityIssue[]
}

export interface ActiveApproval {
  id: string
  grantedAt: string
  grantedBy: string
  version: string
}

export interface ApprovalResolver {
  /** Returns the active granted approval for this document version, or `null`. */
  getActiveApproval: (
    collection: string,
    id: string,
    version: string,
  ) => Promise<ActiveApproval | null>
}

export interface RecipeGateOptions {
  /** The block type a composed section is stored as, e.g. `ComposedSection`. */
  blockType: string
  /** The collection its recipes live in, e.g. `section-recipes`. */
  collection: string
  /** The block's relationship to its recipe. Default: `recipe`. */
  recipeField?: string
  /** The block's content, one value per recipe field. Default: `content`. */
  contentField?: string
  /** Whether a recipe may be published. Default: its `status` is `approved`. */
  isApproved?: (recipe: Record<string, unknown>) => boolean
}

export interface PublishingPluginOptions extends BaseCorePluginOptions {
  /** Required: collections that can be published through this server. */
  collections: PublishableCollection[]
  /** Optional: extra accessibility checks beyond the built-ins. */
  accessibilityChecks?: AccessibilityCheck[]
  /**
   * Optional: names of built-in accessibility checks to skip —
   * `'alt-text'`, `'heading-hierarchy'`, `'link-labels'`.
   *
   * `accessibilityChecks` only appends, so without this a built-in that
   * misfires on a host's content shape blocks every publish until the
   * plugin ships a fix. Switch one off here and supply your own.
   */
  disableAccessibilityChecks?: string[]
  /** Optional: resolver consulted when a document's policy requires approval. */
  approvalResolver?: ApprovalResolver
  /**
   * Optional: the block that holds a composed section, and where its recipes
   * live (forumone-2026#801). With it, the composition step checks each such
   * block's recipe — that it exists, is approved, still passes `lintRecipe`
   * against the manifest as it is now, and that the block's content fills the
   * recipe's required fields — instead of calling the block an unknown
   * component.
   */
  recipes?: RecipeGateOptions
  /** Required: Inngest client used to fire publishing events. */
  inngest: Inngest
  /**
   * Whether to install the plugin's Publish / Unpublish controls on each
   * configured collection. Default: `true`.
   *
   * Payload's native buttons write `_status` directly, which the plugin's
   * trust boundary rejects — so with this off, the admin has no working
   * publish path until the host supplies its own control (see
   * `publishDocument`).
   */
  adminComponents?: boolean

  /**
   * Where to put this server's MCP tools so Payload's own MCP plugin can serve
   * them.
   *
   * Payload ships `@payloadcms/plugin-mcp`, which takes its tools as a config
   * option — and every tool here is built at `onInit`, because every one closes
   * over `payload`. `createMcpToolCollector()` from `@forumone/throughline`
   * bridges that: the host hands the collector's array to `mcpPlugin` at config
   * time and this plugin fills it at init, which is before any request and
   * therefore before the plugin reads it.
   *
   * Omit it and nothing changes — this server keeps its own `/mcp` endpoint,
   * which is what lets a host move one server at a time.
   */
  mcpTools?: McpToolCollector
}

export type ResolvedCollection = Required<Omit<PublishableCollection, 'requiredFields'>> &
  Pick<PublishableCollection, 'requiredFields'>

const PublishableCollectionSchema = z.object({
  slug: z.string().min(1),
  layoutField: z.string().optional(),
  seoField: z.string().optional(),
  policyField: z.string().optional(),
  slugField: z.string().optional(),
  publishedAtField: z.string().optional(),
  scheduledPublishField: z.string().optional(),
  requiredFields: z
    .array(z.object({ path: z.string().min(1), message: z.string().min(1) }))
    .optional(),
})

/**
 * Validates plugin options at load time. Throws with targeted messages on
 * obvious misconfiguration so deploys fail fast rather than the first publish
 * call returning 503.
 */
export function validateOptions(options: PublishingPluginOptions): PublishingPluginOptions {
  if (!options.collections || options.collections.length === 0) {
    throw new Error('publishingPlugin requires at least one collection in options.collections')
  }
  if (!options.inngest) {
    throw new Error('publishingPlugin requires an Inngest client in options.inngest')
  }
  for (const collection of options.collections) {
    const result = PublishableCollectionSchema.safeParse(collection)
    if (!result.success) {
      const issues = formatZodIssues(result.error)
      throw new Error(`Invalid collection config:\n${issues}`)
    }
  }
  return options
}

/**
 * Returns the collection config with all field-name defaults filled in.
 * Throws when the slug isn't registered as publishable.
 */
export function resolveCollection(
  options: PublishingPluginOptions,
  slug: string,
): ResolvedCollection {
  const config = options.collections.find((c) => c.slug === slug)
  if (!config) {
    throw new Error(
      `Collection "${slug}" is not registered as publishable. Add it to publishingPlugin's collections option.`,
    )
  }
  return {
    slug: config.slug,
    layoutField: config.layoutField ?? 'layout',
    seoField: config.seoField ?? 'seo',
    policyField: config.policyField ?? 'policy',
    slugField: config.slugField ?? 'slug',
    publishedAtField: config.publishedAtField ?? 'publishedAt',
    scheduledPublishField: config.scheduledPublishField ?? 'scheduledPublishAt',
    ...(config.requiredFields ? { requiredFields: config.requiredFields } : {}),
  }
}
