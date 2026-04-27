import { z } from 'zod'
import type { Payload, Where } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { ResolvedFormsConfig } from '../options.js'
import { deniedEnvelope, isFormsAuthor, isPiiReader } from './access.js'

const inputSchema = z.object({
  formId: z.string(),
  limit: z.number().int().positive().max(100).optional(),
  since: z.string().datetime().optional().describe('ISO-8601 lower bound on createdAt.'),
  includePii: z
    .boolean()
    .optional()
    .describe('When true, returns the raw submission data. Requires admin or form-admin role.'),
})

export interface GetFormSubmissionsDeps {
  payload: Payload
  resolved: ResolvedFormsConfig
}

export function createGetFormSubmissionsTool(
  deps: GetFormSubmissionsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'get_form_submissions',
    description:
      "Lists submissions for a form. Defaults to redacted output (counts + timestamps). Set includePii=true to read submission data; that requires admin or form-admin role.",
    inputSchema,
    handler: async (input, ctx) => {
      if (!isFormsAuthor(ctx)) {
        return deniedEnvelope('Only admins and editors can view submission counts.')
      }
      if (input.includePii === true && !isPiiReader(ctx)) {
        return deniedEnvelope(
          'Reading raw submission data requires admin or form-admin role; you have neither.',
        )
      }

      const conditions: Where[] = [{ form: { equals: input.formId } }]
      if (input.since) conditions.push({ createdAt: { greater_than_equal: input.since } })

      const result = await deps.payload.find({
        collection: deps.resolved.submissionsCollectionSlug,
        where: { and: conditions },
        sort: '-createdAt',
        limit: input.limit ?? 20,
      })

      return {
        formId: input.formId,
        total: result.totalDocs,
        returned: result.docs.length,
        submissions: (result.docs as Array<Record<string, unknown>>).map((doc) => ({
          id: String(doc['id']),
          receivedAt: typeof doc['createdAt'] === 'string' ? doc['createdAt'] : null,
          consentGivenAt: typeof doc['consentGivenAt'] === 'string' ? doc['consentGivenAt'] : null,
          data: input.includePii ? (doc['submissionData'] ?? null) : '[redacted — set includePii=true]',
        })),
      }
    },
  }
}
