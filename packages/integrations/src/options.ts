import type { Inngest } from 'inngest'
import type { BaseCorePluginOptions } from '@forumone/throughline-plugin-contract'
import type { Integration } from './types.js'

export const DEFAULT_INTEGRATIONS_SLUG = 'integrations'

export interface IntegrationsPluginOptions extends BaseCorePluginOptions {
  /**
   * Inngest client used to register integration functions and to fire
   * manual-sync trigger events. Required: integrations are an
   * event-driven feature and there is no useful behaviour without one.
   */
  inngest: Inngest
  /**
   * Integration modules to register, in addition to the built-in webhook
   * integration. Order matters only for tie-breaking in lists; the registry
   * rejects duplicate ids.
   */
  integrations?: Integration[]
  /** Override the Integrations collection slug. Default: 'integrations'. */
  collectionSlug?: string
}

export function validateOptions(options: IntegrationsPluginOptions): IntegrationsPluginOptions {
  if (!options.inngest) {
    throw new Error('integrationsPlugin requires an Inngest client (`options.inngest`).')
  }
  return options
}
