import {
  type BaseCorePluginOptions,
  type CorePlugin,
  getPluginRegistry,
} from '@forumone/throughline-plugin-contract'
import { createJobFailuresCollection, type JobFailuresCollectionOptions } from './collection.js'
import { createJobFailureWriter, type JobFailureWriter } from './writer.js'
import { defaultLogger } from '../logger/index.js'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { McpToolCollector } from '../mcp/collector.js'
import { OBSERVABILITY_TOOL_DESCRIPTORS, createListJobFailuresTool } from './tool.js'

const PLUGIN_ID = '@forumone/throughline-core/observability'
const PLUGIN_VERSION = '0.1.0'
const WRITER_SYMBOL = Symbol.for('@forumone/throughline/job-failure-writer')

export interface JobFailuresPluginOptions
  extends BaseCorePluginOptions, JobFailuresCollectionOptions {
  /** Where `list_job_failures` goes. Omit for no MCP tool. Must come before `mcpPlugin`. */
  mcpTools?: McpToolCollector
}

/**
 * Adds the `job-failures` collection and attaches its writer to the Payload
 * instance, where `getJobFailureWriter` — and the workflows package's failure
 * handlers — find it.
 */
export const jobFailuresPlugin: CorePlugin<JobFailuresPluginOptions> =
  (options) => (incomingConfig) => {
    if (options.enabled === false) return incomingConfig

    options.mcpTools?.declare(OBSERVABILITY_TOOL_DESCRIPTORS, { serverName: 'observability' })

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), createJobFailuresCollection(options)],
      onInit: async (payload) => {
        if (incomingConfig.onInit) await incomingConfig.onInit(payload)

        Object.defineProperty(payload, WRITER_SYMBOL, {
          value: createJobFailureWriter({
            payload,
            collectionSlug: options.slug,
            logger: options.logger ?? defaultLogger,
          }),
          enumerable: false,
          writable: false,
          configurable: false,
        })

        options.mcpTools?.add(
          [
            createListJobFailuresTool({
              payload,
              ...(options.slug ? { slug: options.slug } : {}),
            }),
          ] as unknown as McpToolDefinition[],
          { serverName: 'observability' },
        )

        getPluginRegistry(payload).register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['job-failures'],
        })
      },
    }
  }

/**
 * The writer `jobFailuresPlugin` attached, or `undefined` when the plugin is
 * not registered.
 *
 * Unlike `getAuditWriter` this does not throw: it is called from failure
 * handlers, which fall back to logging and reporting when there is nowhere
 * to write.
 */
export function getJobFailureWriter(payload: object): JobFailureWriter | undefined {
  return (payload as Record<symbol, unknown>)[WRITER_SYMBOL] as JobFailureWriter | undefined
}
