import type { CorePlugin, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger, getAuditWriter } from '@forumone/throughline-core'
import { getEmailClient as readEmailClient } from '@forumone/throughline-email'
import type { InngestFunction } from 'inngest'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { type FormsPluginOptions, validateOptions } from './options.js'
import { addFormPolicyFields } from './policy-fields.js'
import { validateDestinationLabel } from './destinations.js'
import { createSubmitEndpoint } from './submit/endpoint.js'
import {
  FORMS_TOOL_DESCRIPTORS,
  createCreateFormTool,
  createGetFormSubmissionsTool,
  createListAllowedDestinationsTool,
  createUpdateFormDestinationsTool,
  createUpdateFormFieldsTool,
  createValidateFormTool,
} from './tools/index.js'
import {
  createEmailDestinationFunction,
  createFormFanOutFunction,
  createSubmitterConfirmationFunction,
  createWebhookDestinationFunction,
} from './functions/index.js'

const PLUGIN_ID = '@forumone/throughline-forms'
const PLUGIN_VERSION = '0.1.0'

const FUNCTIONS_SYMBOL = Symbol.for('@forumone/throughline/forms-functions')

interface PolicyDestinationRow {
  label?: string
  enabled?: boolean
}

/**
 * Forms plugin. Composes the official Form Builder plugin with the
 * Throughline policy layer:
 *
 * 1. Form Builder runs first to create the `forms` and `form-submissions`
 *    collections and the field overrides slot.
 * 2. We layer the policy group onto the forms collection's fields and
 *    add the access-control + extra fields onto submissions.
 * 3. We add the public submit endpoint and the MCP endpoint.
 * 4. At init we register tools, register Inngest functions via Symbol so
 *    the client app's Inngest endpoint can compose them, and require
 *    the audit-log + email capabilities.
 */
export const formsPlugin: CorePlugin<FormsPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const resolved = validateOptions(rawOptions)
    const logger = createNamedLogger('forms', rawOptions.logger ?? defaultLogger)

    const policyFieldsOptions = {
      availableDestinationLabels: resolved.destinationLabels,
      defaultPrivacyNotice: resolved.defaultPrivacyNotice,
      requireConsentByDefault: resolved.requireConsentByDefault,
      defaultRateLimit: resolved.rateLimit,
    }

    const formBuilderConfig = formBuilderPlugin({
      fields: {
        text: true,
        textarea: true,
        email: true,
        select: true,
        checkbox: true,
        number: true,
        message: true,
      },
      formOverrides: {
        fields: ({ defaultFields }) => addFormPolicyFields(defaultFields, policyFieldsOptions),
        hooks: {
          beforeChange: [
            async ({ data, operation }) => {
              if (operation !== 'create' && operation !== 'update') return data
              const policy = ((data as Record<string, unknown> | undefined)?.['policy'] ?? {}) as Record<string, unknown>
              const destinations = Array.isArray(policy['destinations'])
                ? (policy['destinations'] as PolicyDestinationRow[])
                : []
              for (const dest of destinations) {
                if (!dest.label) continue
                const check = validateDestinationLabel(resolved.options, dest.label)
                if (!check.ok) {
                  throw new Error(
                    `Destination "${dest.label}" is not on the allowlist. Adding it requires editing the plugin config and redeploying.`,
                  )
                }
              }
              return data
            },
          ],
        },
      },
      formSubmissionOverrides: {
        access: {
          read: ({ req }) => {
            const roles = (req.user?.['roles'] as string[] | undefined) ?? []
            return roles.includes('admin') || roles.includes('form-admin')
          },
          create: () => true,
          update: () => false,
          delete: ({ req }) => {
            const roles = (req.user?.['roles'] as string[] | undefined) ?? []
            return roles.includes('admin')
          },
        },
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: 'ipHash',
            type: 'text',
            admin: { readOnly: true },
          },
          {
            name: 'consentGivenAt',
            type: 'date',
            admin: { readOnly: true },
          },
        ],
      },
    })

    const withFormBuilder = formBuilderConfig(incomingConfig)
    const submitEndpoint = createSubmitEndpoint(resolved)

    /*
    Declared here, bound at `onInit` — `mcpPlugin` generates its per-key
    checkboxes from these names and descriptions while the config is built, and
    denies any tool it has no checkbox for. This plugin must therefore come
    before `mcpPlugin` in the host's array.
    */
    resolved.options.mcpTools?.declare(FORMS_TOOL_DESCRIPTORS, { serverName: 'forms' })

    return {
      ...withFormBuilder,
      endpoints: [
        ...(withFormBuilder.endpoints ?? []),
        submitEndpoint,
      ] as NonNullable<typeof withFormBuilder.endpoints>,
      onInit: async (payload) => {
        if (withFormBuilder.onInit) await withFormBuilder.onInit(payload)

        const registry = getPluginRegistry(payload)
        registry.requireCapability('audit-log', PLUGIN_ID)
        registry.requireCapability('email', PLUGIN_ID)

        const auditWriter = getAuditWriter(payload)
        const tools = [
          createListAllowedDestinationsTool({ options: resolved.options }),
          createValidateFormTool({ options: resolved.options }),
          createCreateFormTool({ payload, resolved }),
          createUpdateFormFieldsTool({ payload, resolved }),
          createUpdateFormDestinationsTool({ payload, resolved }),
          createGetFormSubmissionsTool({ payload, resolved }),
        ] as unknown as McpToolDefinition[]

        // Payload's own MCP plugin, and the only transport these tools have.
        // `onInit` is both the earliest they can exist and still early enough
        // that `mcpPlugin` reads the array populated.
        resolved.options.mcpTools?.add(tools, { serverName: 'forms', logger, audit: auditWriter })

        const fanOutDeps = { inngest: resolved.options.inngest, payload, resolved }
        const getEmailClient = () => readEmailClient(payload)
        const functions: InngestFunction.Any[] = [
          createFormFanOutFunction(fanOutDeps),
          createEmailDestinationFunction({ ...fanOutDeps, getEmailClient }),
          createWebhookDestinationFunction(fanOutDeps),
          createSubmitterConfirmationFunction({ ...fanOutDeps, getEmailClient }),
        ]

        Object.defineProperty(payload, FUNCTIONS_SYMBOL, {
          value: functions,
          enumerable: false,
          writable: false,
          configurable: false,
        })

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['forms', 'form-submission-ingest'],
        })

        logger.info('Forms server ready', {
          allowedDestinations: resolved.options.allowedDestinations.length,
          routePrefix: resolved.routePrefix,
        })
      },
    }
  }

export function getFormsFunctions(payload: unknown): InngestFunction.Any[] {
  return (
    ((payload as Record<symbol, unknown>)[FUNCTIONS_SYMBOL] as InngestFunction.Any[] | undefined) ??
    []
  )
}
