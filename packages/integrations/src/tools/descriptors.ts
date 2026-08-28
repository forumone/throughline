import type { McpToolDescriptor } from '@forumone/throughline-core'

/*
This server's tools, by name and description, knowable without a Payload.

`@payloadcms/plugin-mcp` reads exactly these two fields while the host's config
is being built, to generate one per-key checkbox per tool, and denies any tool it
has no checkbox for. The handlers close over `payload` and the integration
registry, so they cannot exist that early — the names never needed to wait.

The factories below spread these, so the two cannot drift.
*/
export const INTEGRATIONS_TOOLS = {
  listIntegrations: {
    name: 'list_integrations',
    description:
      'Lists configured integration instances and their last-sync status. Use to answer "what connections are set up?" or "is the webhook to Slack still working?". Read-only.',
  },
  getIntegrationStatus: {
    name: 'get_integration_status',
    description:
      'Detailed status for a single integration instance — including its last sync time, last error, and current configuration metadata (config values themselves are admin-only and not returned).',
  },
  triggerSync: {
    name: 'trigger_sync',
    description:
      'Manually triggers an integration to send a test payload. Useful for verifying connectivity after a config change or after the integration has been failing. Admin-only because triggering an external POST is a write-side action.',
  },
  testIntegration: {
    name: 'test_integration',
    description:
      "Calls the integration's healthcheck. Use to answer 'is the integration reachable / configured correctly?'. Doesn't fire any system events; the test is local to the integration's healthcheck.",
  },
  listIntegrationTypes: {
    name: 'list_integration_types',
    description:
      'Lists the integration plugins available in this deployment. Use when answering "what kinds of integrations are supported here?" or before suggesting that someone add a new instance.',
  },
} as const satisfies Record<string, McpToolDescriptor>

/** Every tool this server contributes, for the collector. */
export const INTEGRATIONS_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(INTEGRATIONS_TOOLS)
