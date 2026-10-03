import { z } from 'zod'
import type { Payload, PayloadRequest } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline'
import type { McpToolDescriptor } from '@forumone/throughline'
import { readYourWork, type WorkOptions, type YourWorkResult } from './work.js'

/*
"Your work", as an MCP tool: the same two lists the dashboard shows, read the
same way, as the caller.
*/

export const WORK_TOOLS = {
  listMyWork: {
    name: 'list_my_work',
    description:
      'What is waiting on somebody: documents with unpublished changes, newest first, and scheduled publishes, soonest first, each with its admin link. These are the dashboard\'s "Your work" panels. They list everything waiting that you can open, not only what you edited, because nothing records who edited what. Use for "what is half done?" or "what goes out next?".',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const WORK_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(WORK_TOOLS)

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Rows per list. Default: the dashboard's, 8."),
})

/** The lists as the tool returns them, with an admin link per row. */
export function toolWork(work: YourWorkResult, adminRoute: string) {
  const link = (row: YourWorkResult['changes'][number]) => ({
    ...row,
    adminUrl: `${adminRoute}/collections/${row.collection}/${String(row.id)}`,
  })
  return {
    generatedAt: work.generatedAt,
    unpublishedChanges: work.changes.map(link),
    scheduledToPublish: work.scheduled.map(link),
  }
}

export function createListMyWorkTool(deps: {
  payload: Payload
  work: WorkOptions
}): McpToolDefinition<typeof inputSchema> {
  return {
    ...WORK_TOOLS.listMyWork,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return {
          error:
            'Must be authenticated: your work is read with your own access, and an API key alone carries no identity.',
        }
      }
      const work = await readYourWork(deps.payload, {
        work: { ...deps.work, ...(input.limit ? { limit: input.limit } : {}) },
        // The same cast and the same reason as publishing's `resolvePublishingActor`.
        user: ctx.user as unknown as PayloadRequest['user'],
      })
      return toolWork(work, deps.payload.config.routes.admin)
    },
  }
}
