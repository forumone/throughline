import type { Access, CollectionConfig } from 'payload'

/*
Where a background job's failure is recorded.

Deliberately not the audit log. `audit-events` records who did what through
an MCP tool — `mcpServer` and `mcpTool` are `NOT NULL`, and every row answers
"which tool did this". A cron that ran out of retries is not an action anybody
took; it is an operational fact, with its own fields (a run id, a triggering
event) and its own lifetime (worth keeping for weeks, not forever). Giving it
a fake MCP server name would make that column mean nothing.

Read-only from outside the writer, like the audit log: the writer uses the
Local API, which bypasses these access rules.
*/

export const DEFAULT_JOB_FAILURES_SLUG = 'job-failures'

/** What kind of thing failed. Adding a value is a schema change and needs a migration. */
export const JOB_FAILURE_KINDS = ['job', 'healthcheck'] as const
export type JobFailureKind = (typeof JOB_FAILURE_KINDS)[number]

export interface JobFailuresCollectionOptions {
  /** Override the collection slug. Default: `'job-failures'`. */
  slug?: string
  /** Read access. Default: users with the `admin` role. */
  readAccess?: Access
}

const adminOnly: Access = ({ req }) => {
  const roles = (req.user?.['roles'] as string[] | undefined) ?? []
  return roles.includes('admin')
}

export function createJobFailuresCollection(
  options: JobFailuresCollectionOptions = {},
): CollectionConfig {
  return {
    slug: options.slug ?? DEFAULT_JOB_FAILURES_SLUG,
    admin: {
      useAsTitle: 'summary',
      defaultColumns: ['createdAt', 'kind', 'source', 'message'],
      description:
        'Background jobs that ran out of retries, and healthchecks that failed. Read-only; written by the failure handlers.',
    },
    access: {
      read: options.readAccess ?? adminOnly,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      {
        name: 'createdAt',
        type: 'date',
        required: true,
        defaultValue: () => new Date().toISOString(),
        admin: { position: 'sidebar', readOnly: true },
      },
      {
        name: 'kind',
        type: 'select',
        required: true,
        options: JOB_FAILURE_KINDS.map((value) => ({ label: value, value })),
      },
      {
        name: 'source',
        type: 'text',
        required: true,
        admin: { description: 'The function or check that failed, e.g. an Inngest function id.' },
      },
      { name: 'summary', type: 'text', required: true },
      { name: 'message', type: 'textarea', required: true },
      { name: 'errorName', type: 'text' },
      {
        name: 'runId',
        type: 'text',
        admin: { description: "The run's id in the job runner, for finding it in its dashboard." },
      },
      { name: 'triggerEvent', type: 'text' },
      {
        name: 'details',
        type: 'json',
        admin: { description: 'For a healthcheck: every failed check and what it said.' },
      },
      { name: 'environment', type: 'text' },
      { name: 'commit', type: 'text' },
    ],
    indexes: [{ fields: ['createdAt'] }, { fields: ['source', 'createdAt'] }],
    timestamps: false,
  }
}
