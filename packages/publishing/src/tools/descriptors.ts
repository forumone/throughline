import type { McpToolDescriptor } from '@forumone/throughline-core'

/*
This server's tools, by name and description, knowable without a Payload.

`@payloadcms/plugin-mcp` reads exactly these two fields while the host's config
is being built, to generate one per-key checkbox per tool — and gates every call
on the checkbox matching the tool's name. The handlers cannot exist that early,
because each closes over `payload`, the publishing service and the audit writer.
So the plugin declares from here as the config builds, and binds handlers at
`onInit`.

The factories below spread these, so a description edited here is the one the
checkbox and the MCP client both show, and the two cannot drift.
*/
export const PUBLISHING_TOOLS = {
  publish: {
    name: 'publish',
    description:
      'Publishes a draft document. Runs the full publish pipeline: composition, accessibility, required-field, embargo, and approval checks. Returns success with the publish timestamp, or a specific failedAt step with reason / suggestion when something blocks the publish.',
  },
  unpublish: {
    name: 'unpublish',
    description:
      'Unpublishes a published document by reverting it to draft. Use when content needs to be removed from the public site without deleting it. Fires content/page.unpublished so revalidation and integrations can react.',
  },
  schedulePublish: {
    name: 'schedule_publish',
    description:
      "Schedules a future publish. Validates the document would currently pass the preflight pipeline (composition, accessibility, required fields, embargo, approval), then stores `scheduledPublishAt` on the document. The framework's workflow runner picks up the schedule and executes the full publish pipeline at that time.",
  },
  getPublishStatus: {
    name: 'get_publish_status',
    description:
      'Returns the current publishability of a document without actually publishing. Reports current status, whether unpublished changes exist, the last publish timestamp, and a preflight result indicating whether `publish` would currently succeed. Read-only; no audit record is written.',
  },
  rollback: {
    name: 'rollback',
    description:
      "Rolls a document back to a prior version from Payload's version history. The restored content lands as a fresh draft; call `publish` afterwards if you want it live again. Audits the rollback under publishing.rollback.",
  },
} as const satisfies Record<string, McpToolDescriptor>

/** Every tool this server contributes, for the collector. */
export const PUBLISHING_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(PUBLISHING_TOOLS)
