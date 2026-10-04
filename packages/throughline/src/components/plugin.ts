import type { CorePlugin } from '../plugin-contract/index.js'
import { getPluginRegistry } from '../plugin-contract/registry.js'
import { createNamedLogger, defaultLogger } from '../logger/index.js'
import { getAuditWriter } from '../audit/plugin.js'
import { type ComponentsPluginOptions, validateOptions } from './options.js'
import { createManifestLoader, type ManifestLoader } from './manifest-source.js'
import { createTfidfMatcher } from './matching/index.js'
import {
  RECIPE_TOOL_DESCRIPTORS,
  createGetRecipeVocabularyTool,
  createSaveRecipeTool,
  createValidateRecipeTool,
} from './tools/recipes.js'
import {
  COMPONENTS_TOOL_DESCRIPTORS,
  createFindAntiPatternTool,
  createGetContractTool,
  createGetTokensTool,
  createGetVariantsTool,
  createListComponentsTool,
  createSuggestForIntentTool,
  createValidateCompositionTool,
} from './tools/index.js'
import {
  type CompositionInput,
  type CompositionResult,
  validateComposition,
} from './validation/composition.js'

const PLUGIN_ID = '@forumone/throughline/components'
const PLUGIN_VERSION = '0.1.0'
/**
 * Internal IPC point: peer plugins (publishing, etc.) read this symbol from
 * the Payload instance to call composition validation directly without
 * going through MCP. Keep this string in lockstep with the matching constant
 * in the publishing package.
 */
const VALIDATOR_SYMBOL = Symbol.for('@forumone/throughline/components-validator')

/** Where the loaded manifest is attached, for peers that need the manifest itself. */
export const MANIFEST_SYMBOL = Symbol.for('@forumone/throughline/components-manifest')

export const componentsPlugin: CorePlugin<ComponentsPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    const logger = createNamedLogger('components', options.logger ?? defaultLogger)
    const maxRecommendations = options.matching?.maxRecommendations ?? 5

    /*
    Declared here, bound at `onInit` — `mcpPlugin` generates its per-key
    checkboxes from these names and descriptions while the config is built, and
    denies any tool it has no checkbox for. This plugin must therefore come
    before `mcpPlugin` in the host's array.
    */
    options.mcpTools?.declare(
      options.recipes
        ? [...COMPONENTS_TOOL_DESCRIPTORS, ...RECIPE_TOOL_DESCRIPTORS]
        : COMPONENTS_TOOL_DESCRIPTORS,
      { serverName: 'components' },
    )

    return {
      ...incomingConfig,
      onInit: async (payload) => {
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        const registry = getPluginRegistry(payload)
        registry.requireCapability('audit-log', PLUGIN_ID)

        const auditWriter = getAuditWriter(payload)
        const loader = createManifestLoader(options.manifest, payload)

        // Eager load: fail fast if the manifest source is broken at deploy
        // time rather than on the first request.
        const manifest = await loader.get()
        const components = Object.values(manifest.raw.components)
        logger.info('Manifest loaded', {
          designSystem: manifest.designSystem.name,
          version: manifest.designSystem.version,
          componentCount: components.length,
        })

        const matcher = createTfidfMatcher(components)

        const tools = [
          createListComponentsTool(loader),
          createGetContractTool(loader),
          createGetVariantsTool(loader),
          createGetTokensTool(loader),
          createSuggestForIntentTool({ loader, matcher, auditWriter, maxRecommendations }),
          createValidateCompositionTool({
            loader,
            auditWriter,
            ...(options.recipes ? { composedBlockType: options.recipes.blockType } : {}),
          }),
          createFindAntiPatternTool({ loader, auditWriter }),
          ...(options.recipes
            ? [
                createGetRecipeVocabularyTool({ loader }),
                createValidateRecipeTool({ loader, auditWriter }),
                createSaveRecipeTool({
                  payload,
                  loader,
                  auditWriter,
                  collection: options.recipes.collection,
                }),
              ]
            : []),
        ]

        // Payload's own MCP plugin, and the only transport these tools have.
        // `onInit` is both the earliest they can exist and still early enough
        // that `mcpPlugin` reads the array populated.
        options.mcpTools?.add(tools, { serverName: 'components', logger, audit: auditWriter })

        attachValidator(payload, loader)

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: [
            'component-server',
            'manifest-loading',
            'intent-matching',
            'composition-validation',
          ],
        })
      },
    }
  }

/**
 * Attaches a composition-validation function to the Payload instance under
 * VALIDATOR_SYMBOL so peer plugins (the publishing server) can validate
 * compositions in-process without going through the MCP transport.
 */
function attachValidator(payload: object, loader: ManifestLoader): void {
  const validator = async (input: CompositionInput): Promise<CompositionResult> => {
    const manifest = await loader.get()
    return validateComposition(input, manifest)
  }
  Object.defineProperty(payload, VALIDATOR_SYMBOL, {
    value: validator,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  /*
  The manifest itself, for the publish step's recipe check (forumone-2026#801):
  a composed section is linted against the design system as it is at publish,
  which is this loader's answer, not a copy taken when the recipe was saved.
  */
  Object.defineProperty(payload, MANIFEST_SYMBOL, {
    value: async () => (await loader.get()).raw,
    enumerable: false,
    writable: false,
    configurable: false,
  })
}
