import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger, getAuditWriter } from '@forumone/throughline-core'
import { type ComponentsPluginOptions, validateOptions } from './options.js'
import { createManifestLoader, type ManifestLoader } from './manifest-source.js'
import { createTfidfMatcher } from './matching/index.js'
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

const PLUGIN_ID = '@forumone/throughline-components'
const PLUGIN_VERSION = '0.1.0'
/**
 * Internal IPC point: peer plugins (publishing, etc.) read this symbol from
 * the Payload instance to call composition validation directly without
 * going through MCP. Keep this string in lockstep with the matching constant
 * in the publishing package.
 */
const VALIDATOR_SYMBOL = Symbol.for('@forumone/throughline/components-validator')

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
    options.mcpTools?.declare(COMPONENTS_TOOL_DESCRIPTORS, { serverName: 'components' })

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
          createValidateCompositionTool({ loader, auditWriter }),
          createFindAntiPatternTool({ loader, auditWriter }),
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
}
