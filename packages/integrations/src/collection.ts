import type { Access, CollectionConfig, Endpoint } from 'payload'
import type { IntegrationRegistry } from './registry.js'
import { DEFAULT_INTEGRATIONS_SLUG } from './options.js'

/**
 * Where Payload resolves the admin controls from. A package specifier, not a
 * path, so the host's import map picks it up without any host-side file.
 */
const CLIENT_ENTRY = '@forumone/throughline-integrations/client'

export interface CreateIntegrationsCollectionOptions {
  slug?: string
  registry: IntegrationRegistry
  /** Collection endpoints to mount, e.g. the manual-sync trigger. */
  endpoints?: Endpoint[]
}

const adminOrEditor: Access = ({ req }) => {
  const roles = (req.user?.['roles'] as string[] | undefined) ?? []
  return roles.includes('admin') || roles.includes('editor')
}

const adminOnly: Access = ({ req }) => {
  const roles = (req.user?.['roles'] as string[] | undefined) ?? []
  return roles.includes('admin')
}

/**
 * Collection that persists per-instance integration configuration. Configuration
 * is admin-only by design: prompt injection that gave Claude write access here
 * would let an attacker re-target webhook URLs or rotate signing secrets.
 *
 * Editors can read instance status (used by the listing/status MCP tools);
 * write operations are reserved for admins editing in the Payload UI.
 *
 * The one control on the document that is not a field is the sidebar's Sync
 * now button, which POSTs to the `:id/sync` endpoint passed in `endpoints`.
 */
export function createIntegrationsCollection(
  options: CreateIntegrationsCollectionOptions,
): CollectionConfig {
  const slug = options.slug ?? DEFAULT_INTEGRATIONS_SLUG
  const { registry } = options

  return {
    slug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'integrationType', 'enabled', 'lastSyncAt', 'lastSyncStatus'],
      description:
        'External-system connections. Edit only in the admin — Claude can trigger and observe but cannot configure.',
    },
    access: {
      read: adminOrEditor,
      create: adminOnly,
      update: adminOnly,
      delete: adminOnly,
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
        admin: { description: 'Display name for this instance (e.g. "Mailchimp - Newsletter").' },
      },
      {
        name: 'integrationType',
        type: 'select',
        required: true,
        options: registry
          .list()
          .map((integration) => ({ label: integration.name, value: integration.id })),
        admin: { description: 'The integration plugin this instance uses.' },
      },
      {
        name: 'enabled',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          description:
            'Disabled integrations are skipped by event delivery and excluded from `list_integrations` unless onlyEnabled=false.',
        },
      },
      {
        name: 'config',
        type: 'json',
        admin: {
          description:
            'Integration-specific configuration. The integration\'s configFields drive the admin UI; this JSON store carries the validated payload.',
        },
      },
      {
        /*
        The only admin component this plugin ships. In the sidebar rather than
        `beforeDocumentControls` because it belongs with the three fields it
        moves — an operator watching for a sync to land is already reading
        `lastSyncAt` — and because `beforeDocumentControls` also renders on the
        create view, where there is no instance to sync.

        A `ui` field: no column, no value, nothing to save.
        */
        name: 'triggerSync',
        type: 'ui',
        label: 'Manual sync',
        admin: {
          position: 'sidebar',
          components: {
            Field: {
              path: CLIENT_ENTRY,
              exportName: 'SyncButton',
              clientProps: { collectionSlug: slug },
            },
          },
        },
      },
      {
        name: 'lastSyncAt',
        type: 'date',
        admin: { readOnly: true, position: 'sidebar' },
      },
      {
        name: 'lastSyncStatus',
        type: 'select',
        admin: { readOnly: true, position: 'sidebar' },
        options: [
          { label: 'Never run', value: 'never-run' },
          { label: 'Success', value: 'success' },
          { label: 'Partial', value: 'partial' },
          { label: 'Failed', value: 'failed' },
        ],
        defaultValue: 'never-run',
      },
      {
        name: 'lastError',
        type: 'textarea',
        admin: { readOnly: true },
      },
    ],
    endpoints: options.endpoints ?? [],
    indexes: [
      { fields: ['integrationType', 'enabled'] },
      { fields: ['lastSyncStatus'] },
    ],
    hooks: {
      beforeChange: [
        async ({ data, operation }) => {
          if (operation !== 'create' && operation !== 'update') return data
          const incoming = data as Record<string, unknown>
          const integrationType = incoming['integrationType']
          if (typeof integrationType !== 'string') return data

          const integration = registry.get(integrationType)
          if (!integration) {
            throw new Error(
              `Unknown integration type "${integrationType}". Known types: ${registry
                .list()
                .map((i) => i.id)
                .join(', ') || '(none registered)'}.`,
            )
          }

          const config = (incoming['config'] ?? {}) as Record<string, unknown>
          const validation = await integration.validateConfig(config)
          if (!validation.ok) {
            throw new Error(
              `Invalid config for ${integration.name}: ${validation.reason ?? 'no reason given'}`,
            )
          }
          return data
        },
      ],
    },
  }
}
