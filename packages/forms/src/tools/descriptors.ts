import type { McpToolDescriptor } from '@forumone/throughline-core'

/*
This server's tools, by name and description, knowable without a Payload.

`@payloadcms/plugin-mcp` reads exactly these two fields while the host's config
is being built, to generate one per-key checkbox per tool, and denies any tool it
has no checkbox for. The handlers close over `payload` and the resolved options,
so they cannot exist that early — the names never needed to wait.

The factories below spread these, so the two cannot drift.
*/
export const FORMS_TOOLS = {
  listAllowedDestinations: {
    name: 'list_allowed_destinations',
    description:
      'Returns the labels of destinations forms can route submissions to in this deployment. Use this before create_form / update_form_destinations to discover what is allowed. Adding a new destination requires editing the plugin config and redeploying — that friction is the security model.',
  },
  validateForm: {
    name: 'validate_form',
    description:
      'Runs the same checks `create_form` runs (allowlist, accessibility, submitter-confirmation pointer) without writing anything. Use to confirm a form definition is shippable before persisting it.',
  },
  createForm: {
    name: 'create_form',
    description:
      'Creates a form with privacy notice, consent checkbox, and honeypot enabled by default. Destinations must be selected from the allowlist (call list_allowed_destinations first). Field names must be snake_case; every field needs a label (accessibility); submitterConfirmation, if enabled, must point to an existing email-typed field on the form.',
  },
  updateFormFields: {
    name: 'update_form_fields',
    description:
      "Replaces the fields on an existing form. Re-runs the same accessibility / submitter-confirmation checks `create_form` runs against the form's current submitterConfirmation config so existing email-field references stay valid.",
  },
  updateFormDestinations: {
    name: 'update_form_destinations',
    description:
      "Replaces a form's destinations with the given labels. Every label must be on the allowlist (use list_allowed_destinations to discover). The replace-all semantics are deliberate — incremental destination edits are too easy to misuse via prompt injection.",
  },
  getFormSubmissions: {
    name: 'get_form_submissions',
    description:
      'Lists submissions for a form. Defaults to redacted output (counts + timestamps). Set includePii=true to read submission data; that requires admin or form-admin role.',
  },
} as const satisfies Record<string, McpToolDescriptor>

/** Every tool this server contributes, for the collector. */
export const FORMS_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(FORMS_TOOLS)
