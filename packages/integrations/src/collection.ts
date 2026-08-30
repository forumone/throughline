import type { Access, CollectionConfig, Endpoint, FieldAccess } from 'payload'
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
 * The same rule, at the field. `FieldAccess` is a different signature from
 * `Access` — it may only answer a boolean, never a `where` query — so it cannot
 * be the same function.
 */
const adminOnlyField: FieldAccess = ({ req }) => {
  const roles = (req.user?.['roles'] as string[] | undefined) ?? []
  return roles.includes('admin')
}

/**
 * Collection that persists per-instance integration configuration. Configuration
 * is admin-only by design: prompt injection that gave Claude write access here
 * would let an attacker re-target webhook URLs or rotate signing secrets.
 *
 * Editors can read instance status (used by the listing/status MCP tools);
 * write operations are reserved for admins editing in the Payload UI. *Status*
 * is the operative word: `config` carries its own admin-only field access, so
 * an editor's read returns the row without the credentials in it.
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
        /*
        Admin-only at the field, because this is where the credentials are.

        Document read is admin *or* editor, and deliberately so — the reason an
        editor opens this collection is to see whether last night's sync ran.
        But a document read hands over the whole document, and `config` is one
        JSON column holding whatever an integration needs to authenticate: a
        HubSpot private app token, a signing secret, a webhook URL. The
        docblock above has always said editors read instance *status*; without
        this, that was a description of the intent rather than of the code.

        Nothing that needs the value loses it. Every reader of `config` goes
        through the Local API — `loadInstances` here, and the host's sync and
        form endpoints — which overrides access. The MCP tools project a fixed
        field list that never included `config`. What changes is `GET /api/<slug>`
        and the admin screen for a non-admin, which now show status and no
        secrets.

        `create` and `update` as well, so the credential cannot be replaced by
        somebody who could not read it. Redundant today, since the collection's
        own create and update are already admin-only, and cheap insurance
        against the day document write is widened for status edits.
        */
        access: {
          read: adminOnlyField,
          create: adminOnlyField,
          update: adminOnlyField,
        },
        admin: {
          description:
            'Integration-specific configuration. The integration\'s configFields drive the admin UI; this JSON store carries the validated payload. Admin-only: it holds the credentials.',
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
