import type { CollectionConfig } from 'payload'
import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger, getAuditWriter } from '@forumone/throughline-core'
import { type PublishingPluginOptions, validateOptions } from './options.js'
import { createBlockStatusWritesHook } from './hooks/block-status-writes.js'
import { createRecordDraftWritesHook } from './hooks/draft-writes.js'
import { createAdminEndpoints } from './endpoints/admin.js'
import { attachPublishingService, createPublishingService } from './service.js'
import {
  PUBLISHING_TOOL_DESCRIPTORS,
  createGetPublishStatusTool,
  createPublishTool,
  createRollbackTool,
  createSchedulePublishTool,
  createUnpublishTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-publishing'
const PLUGIN_VERSION = '0.1.0'
const CLIENT_ENTRY = '@forumone/throughline-publishing/client'

export const publishingPlugin: CorePlugin<PublishingPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    // Payload prepends `config.routes.api` (default `/api`); paths here must
    // not start with /api or they'll be doubled.
    const routePrefix = options.routePrefix ?? '/publishing'
    const logger = createNamedLogger('publishing', options.logger ?? defaultLogger)
    const publishableSlugs = new Set(options.collections.map((c) => c.slug))
    const adminComponents = options.adminComponents !== false

    const modifiedCollections = (incomingConfig.collections ?? []).map((collection) => {
      if (!publishableSlugs.has(collection.slug)) return collection

      return {
        ...collection,
        // The trust boundary: nothing may change the live document's
        // `_status` outside the pipeline. `beforeOperation` records whether
        // the update is a draft write, which is the only place Payload
        // exposes that; `beforeChange` enforces. They must ship together.
        hooks: {
          ...(collection.hooks ?? {}),
          beforeOperation: [
            ...(collection.hooks?.beforeOperation ?? []),
            createRecordDraftWritesHook(),
          ],
          beforeChange: [
            ...(collection.hooks?.beforeChange ?? []),
            createBlockStatusWritesHook(),
          ],
        },
        ...(adminComponents
          ? { admin: withAdminControls(collection, routePrefix) }
          : {}),
      } satisfies CollectionConfig
    })

    /*
    Declared here, bound at `onInit`.

    `mcpPlugin` generates one per-key checkbox per tool while the config is being
    built, from the names and descriptions in this array, and denies any tool it
    has no checkbox for. The handlers cannot exist yet — they close over
    `payload`, the service and the audit writer — but the names never needed to
    wait for them.

    This runs when Payload applies the plugin, so **this plugin must come before
    `mcpPlugin` in the host's array** or the declarations land after the fields
    are generated.
    */
    options.mcpTools?.declare(PUBLISHING_TOOL_DESCRIPTORS, { serverName: 'publishing' })

    return {
      ...incomingConfig,
      collections: modifiedCollections,
      endpoints: [
        ...(incomingConfig.endpoints ?? []),
        ...createAdminEndpoints({ routePrefix, publishableSlugs }),
      ],
      onInit: async (payload) => {
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        const registry = getPluginRegistry(payload)
        registry.requireCapability('audit-log', PLUGIN_ID)

        const auditWriter = getAuditWriter(payload)

        // One service instance behind every channel — MCP tools, the admin
        // endpoints, and host code reaching in through `publishDocument`.
        const service = createPublishingService({ payload, options, auditWriter, logger })
        attachPublishingService(payload, service)

        const tools = [
          createPublishTool({ payload, options, auditWriter, service }),
          createUnpublishTool({ payload, options, auditWriter, service }),
          createSchedulePublishTool({ payload, options, auditWriter }),
          createGetPublishStatusTool({ payload, options, service }),
          createRollbackTool({ payload, options, auditWriter }),
        ]

        /*
        Payload's own MCP plugin, and the only transport these tools have.

        `onInit` is the first moment they can exist — they close over the
        service, the audit writer and `payload` — and it runs before any request,
        which is when `mcpPlugin` reads the array. That ordering is the whole
        reason a config-time option can be filled at init.

        A host that registers this plugin without `mcpTools` gets the publish
        pipeline, the admin controls and `publishDocument`, and no MCP surface
        at all. This plugin used to serve its own `/mcp` endpoint as a fallback;
        it no longer does.
        */
        options.mcpTools?.add(tools, { serverName: 'publishing', logger })

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['publishing', 'publish-pipeline'],
        })

        logger.info('Publishing server ready', {
          collections: options.collections.map((c) => c.slug),
          adminComponents,
        })
      },
    }
  }

/**
 * Points the collection's Publish / Unpublish slots at the plugin's own
 * controls, so a stock admin can publish without any host-side code.
 *
 * A slot the host already set is left alone — an explicit override in the
 * host config wins over the plugin's default.
 *
 * Hosts must run `payload generate:importmap` after adding the plugin (the
 * dev server does it automatically) so Payload can resolve these paths.
 */
function withAdminControls(
  collection: CollectionConfig,
  routePrefix: string,
): NonNullable<CollectionConfig['admin']> {
  const edit = collection.admin?.components?.edit ?? {}

  return {
    ...(collection.admin ?? {}),
    components: {
      ...(collection.admin?.components ?? {}),
      edit: {
        ...edit,
        ...(edit.PublishButton === undefined
          ? {
              PublishButton: {
                path: CLIENT_ENTRY,
                exportName: 'PublishButton',
                clientProps: { routePrefix },
              },
            }
          : {}),
        ...(edit.UnpublishButton === undefined
          ? {
              UnpublishButton: {
                path: CLIENT_ENTRY,
                exportName: 'UnpublishButton',
                clientProps: { routePrefix },
              },
            }
          : {}),
      },
    },
  }
}
