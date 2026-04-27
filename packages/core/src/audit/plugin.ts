import type { Inngest } from 'inngest'
import {
  type BaseCorePluginOptions,
  type CorePlugin,
  getPluginRegistry,
} from '@forumone/throughline-plugin-contract'
import { createAuditCollection, type AuditCollectionOptions } from './collection.js'
import { createAuditWriter, type AuditWriter } from './writer.js'
import { defaultLogger } from '../logger/index.js'

const AUDIT_PLUGIN_ID = '@forumone/throughline-core/audit'
const AUDIT_PLUGIN_VERSION = '0.1.0'
const AUDIT_WRITER_SYMBOL = Symbol.for('@forumone/throughline/audit-writer')

export interface AuditPluginOptions extends BaseCorePluginOptions, AuditCollectionOptions {
  /**
   * Inngest client used to fire `audit/event.recorded` events. If omitted,
   * audit writes still persist; downstream subscribers simply won't receive
   * events.
   */
  inngest?: Inngest
}

export const auditPlugin: CorePlugin<AuditPluginOptions> = (options) => (incomingConfig) => {
  if (options.enabled === false) return incomingConfig

  const auditCollection = createAuditCollection(options)

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), auditCollection],
    onInit: async (payload) => {
      if (incomingConfig.onInit) {
        await incomingConfig.onInit(payload)
      }

      const writer = createAuditWriter({
        payload,
        inngest: options.inngest,
        collectionSlug: options.slug,
        logger: options.logger ?? defaultLogger,
      })

      attachAuditWriter(payload, writer)

      const registry = getPluginRegistry(payload)
      registry.register({
        id: AUDIT_PLUGIN_ID,
        version: AUDIT_PLUGIN_VERSION,
        capabilities: ['audit-log', 'audit-write'],
      })
    },
  }
}

function attachAuditWriter(target: object, writer: AuditWriter): void {
  Object.defineProperty(target, AUDIT_WRITER_SYMBOL, {
    value: writer,
    enumerable: false,
    writable: false,
    configurable: false,
  })
}

/**
 * Retrieves the audit writer attached to a Payload instance by `auditPlugin`.
 * Plugins that depend on auditing call this in their own `onInit` to record
 * events without importing this package's writer factory directly.
 */
export function getAuditWriter(payload: object): AuditWriter {
  const writer = (payload as Record<symbol, unknown>)[AUDIT_WRITER_SYMBOL]
  if (!writer) {
    throw new Error(
      'Audit writer not found. Ensure `auditPlugin` is registered in your Payload config before any plugin that depends on it.',
    )
  }
  return writer as AuditWriter
}
