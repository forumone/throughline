import type { Field } from 'payload'

export interface PolicyFieldsOptions {
  availableDestinationLabels: string[]
  defaultPrivacyNotice: string
  requireConsentByDefault: boolean
  defaultRateLimit: number
}

/**
 * Augments the Form Builder collection's fields with the Throughline policy
 * group: privacy notice, consent toggle and label, spam protection (honeypot
 * + per-form rate limit), allowlist-bound destinations, and an optional
 * submitter-confirmation block.
 *
 * Returns a *new* array; never mutates the input. Form Builder's
 * `formOverrides.fields` callback hands us the default field list.
 */
export function addFormPolicyFields(
  baseFields: Field[],
  options: PolicyFieldsOptions,
): Field[] {
  const destinationOptions = options.availableDestinationLabels.map((label) => ({
    label,
    value: label,
  }))

  return [
    ...baseFields,
    {
      name: 'policy',
      type: 'group',
      admin: {
        description:
          'Privacy notice, consent, spam protection, destinations, and submitter confirmation. Edited in the admin only — Claude cannot modify these directly except through the forms MCP tools.',
      },
      fields: [
        {
          name: 'privacyNoticeText',
          type: 'textarea',
          required: true,
          defaultValue: options.defaultPrivacyNotice,
          admin: {
            description:
              'Required. Shown above the submit button on rendered forms. Legal review recommended.',
          },
        },
        {
          name: 'requiresExplicitConsent',
          type: 'checkbox',
          defaultValue: options.requireConsentByDefault,
          admin: {
            description:
              'When true, the form renders a required consent checkbox above submit. Server-side enforcement: submissions without `consent: true` are rejected at the endpoint.',
          },
        },
        {
          name: 'consentLabel',
          type: 'text',
          defaultValue: 'I agree to the processing of my data as described above.',
        },
        {
          name: 'spamProtection',
          type: 'group',
          fields: [
            {
              name: 'honeypot',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description:
                  'When enabled, the rendered form includes a visually hidden field. Bots that fill every input get silently dropped.',
              },
            },
            {
              name: 'rateLimit',
              type: 'number',
              defaultValue: options.defaultRateLimit,
              admin: {
                description:
                  'Maximum submissions per submitter IP-hash per hour. Falls back to the plugin-wide default.',
              },
            },
          ],
        },
        {
          name: 'destinations',
          type: 'array',
          minRows: 1,
          admin: {
            description:
              'Where submissions are routed. Each entry must reference a label from the plugin\'s allowedDestinations.',
          },
          fields: [
            {
              name: 'label',
              type: 'select',
              required: true,
              options: destinationOptions,
              admin: {
                description:
                  'Pre-approved destination from the allowlist. Adding a new option requires editing plugin config + redeploying.',
              },
            },
            { name: 'enabled', type: 'checkbox', defaultValue: true },
          ],
        },
        {
          name: 'submitterConfirmation',
          type: 'group',
          admin: {
            description:
              'Auto-reply to the submitter. When enabled, set emailFieldName to the form field that captures the submitter\'s email address.',
          },
          fields: [
            { name: 'enabled', type: 'checkbox', defaultValue: false },
            {
              name: 'emailFieldName',
              type: 'text',
              admin: {
                description:
                  'Name of the field on the form that holds the submitter\'s email. Required when enabled.',
              },
            },
            {
              name: 'subject',
              type: 'text',
              defaultValue: 'Thank you for your submission',
            },
            { name: 'body', type: 'textarea' },
          ],
        },
      ],
    },
  ]
}
