import { z } from 'zod'
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'
import type { McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolDescriptor } from '../mcp/collector.js'
import { DEFAULT_JOB_FAILURES_SLUG, JOB_FAILURE_KINDS } from './collection.js'

/*
`list_job_failures`: the `job-failures` collection, for an agent. What failed
in the background, most recent first: a job that ran out of retries, or a
healthcheck that found something wrong. Read as the caller, so the collection's
own read rule (admins, by default) decides who may ask.
*/

export const OBSERVABILITY_TOOLS = {
  listJobFailures: {
    name: 'list_job_failures',
    description:
      'Background jobs that ran out of retries, and healthchecks that failed, most recent first: what failed, when, the error, and the run id to find it in the job runner. Use for "did anything break overnight?" or when a scheduled publish, sync or email did not happen. Filter by `source` (a function id), `kind`, or `sinceHours`.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const OBSERVABILITY_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(OBSERVABILITY_TOOLS)

const inputSchema = z.object({
  sinceHours: z
    .number()
    .positive()
    .max(24 * 90)
    .optional()
    .describe('Only the last N hours. Default: all.'),
  source: z
    .string()
    .optional()
    .describe('Only this function or check, e.g. "publish-at-scheduled-time".'),
  kind: z.enum(JOB_FAILURE_KINDS).optional().describe('Only jobs, or only healthchecks.'),
  limit: z.number().int().positive().max(100).optional().describe('Default: 20.'),
})

export function createListJobFailuresTool(deps: {
  payload: Payload
  slug?: string
}): McpToolDefinition<typeof inputSchema> {
  return {
    ...OBSERVABILITY_TOOLS.listJobFailures,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return {
          error:
            'Must be authenticated: failures are read with your own access, and an API key alone carries no identity.',
        }
      }
      const where = {
        and: [
          ...(input.sinceHours
            ? [
                {
                  createdAt: {
                    greater_than: new Date(Date.now() - input.sinceHours * 3_600_000).toISOString(),
                  },
                },
              ]
            : []),
          ...(input.source ? [{ source: { equals: input.source } }] : []),
          ...(input.kind ? [{ kind: { equals: input.kind } }] : []),
        ],
      }
      const result = await deps.payload.find({
        collection: (deps.slug ?? DEFAULT_JOB_FAILURES_SLUG) as CollectionSlug,
        where,
        sort: '-createdAt',
        limit: input.limit ?? 20,
        depth: 0,
        overrideAccess: false,
        // The same cast and the same reason as publishing's `resolvePublishingActor`.
        user: ctx.user as unknown as PayloadRequest['user'],
      })
      return {
        total: result.totalDocs,
        failures: (result.docs as unknown as Record<string, unknown>[]).map((doc) => {
          const { id: _id, ...rest } = doc
          return rest
        }),
      }
    },
  }
}
