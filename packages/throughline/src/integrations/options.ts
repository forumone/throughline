import type { WorkflowFailureHandler } from '../jobs/index.js'
import type { McpToolCollector } from '../index.js'
import type { Inngest } from 'inngest'
import type { BaseCorePluginOptions, CollectionPluginOptions } from '../index.js'
import type { Integration } from './types.js'

export const DEFAULT_INTEGRATIONS_SLUG = 'integrations'

/*
`routePrefix` is omitted rather than ignored — see the note in the audit
plugin's options. This server's only endpoint was `/<prefix>/mcp`, and its
tools now reach a client through the host's `mcpPlugin`.
*/
export interface IntegrationsPluginOptions
  extends Omit<BaseCorePluginOptions, 'routePrefix'>,
    CollectionPluginOptions {
  /**
   * Inngest client used to register integration functions and to fire
   * manual-sync trigger events. Give this or `emit`: integrations are an
   * event-driven feature and there is no useful behaviour without one.
   */
  inngest?: Inngest
  /**
   * How to send events, for a site that runs integrations as jobs rather than
   * on Inngest: `payloadJobs().emit`. Defaults to `inngest.send`.
   */
  emit?: (event: { name: string; data: unknown }) => Promise<void>
  /**
   * Called once when an integration's Inngest run has exhausted its retries,
   * and given to every integration as `ctx.onFailure`. Default:
   * `createTerminalFailureHandler({ payload })` from the workflows package,
   * which records a `job-failures` row (with `jobFailuresPlugin`), logs, and
   * reports. The webhook integration's two functions ran with none.
   */
  onTerminalFailure?: WorkflowFailureHandler
  /**
   * Integration modules to register, in addition to the built-in webhook
   * integration. Order matters only for tie-breaking in lists; the registry
   * rejects duplicate ids.
   */
  integrations?: Integration[]
  /** Override the Integrations collection slug. Default: 'integrations'. */
  collectionSlug?: string

  /**
   * Where to put this server's MCP tools so Payload's own MCP plugin can serve
   * them.
   *
   * `createMcpToolCollector()` from `@forumone/throughline`. The host hands
   * its array to `@payloadcms/plugin-mcp` at config time and this plugin fills
   * it at `onInit` — which is the first moment the tools can exist, since they
   * close over `payload`, and still before any request reads the array.
   *
   * Omit it and nothing changes: this server keeps its own `/mcp` endpoint,
   * which is what lets a host move one server at a time.
   */
  mcpTools?: McpToolCollector
}

export function validateOptions(options: IntegrationsPluginOptions): IntegrationsPluginOptions {
  if (!options.inngest && !options.emit) {
    throw new Error(
      'integrationsPlugin requires an Inngest client (`options.inngest`) or a jobs adapter\'s `emit`.',
    )
  }
  return options
}
