import {
  type BaseCorePluginOptions,
  type CorePlugin,
  getPluginRegistry,
} from '@forumone/throughline-plugin-contract'
import { createJobFailuresCollection, type JobFailuresCollectionOptions } from './collection.js'
import { createJobFailureWriter, type JobFailureWriter } from './writer.js'
import { defaultLogger } from '../logger/index.js'

const PLUGIN_ID = '@forumone/throughline-core/observability'
const PLUGIN_VERSION = '0.1.0'
const WRITER_SYMBOL = Symbol.for('@forumone/throughline/job-failure-writer')

export interface JobFailuresPluginOptions
  extends BaseCorePluginOptions, JobFailuresCollectionOptions {}

/**
 * Adds the `job-failures` collection and attaches its writer to the Payload
 * instance, where `getJobFailureWriter` — and the workflows package's failure
 * handlers — find it.
 */
export const jobFailuresPlugin: CorePlugin<JobFailuresPluginOptions> =
  (options) => (incomingConfig) => {
    if (options.enabled === false) return incomingConfig

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
