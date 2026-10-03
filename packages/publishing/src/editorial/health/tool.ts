import { z } from 'zod'
import type { Payload, PayloadRequest } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline'
import type { McpToolDescriptor } from '@forumone/throughline'
import type { HealthCheck } from './checks.js'
import { findContentNeedingAttention, type HealthReport } from './find.js'

/*
The content-health view, as an MCP tool. It calls the same function the view
does, with the same checks, as the caller, so an agent and the admin see the
same rows. The only difference is that the tool leaves out each group's
`where` (the view needs it to link to the filtered list; an agent does not) and
links each row to its admin page instead.
*/

export const HEALTH_TOOLS = {
  findContentNeedingAttention: {
    name: 'find_content_needing_attention',
    description:
      'Lists published content that needs a review, by check: pages not revised within their threshold, pages missing a meta description or image, images in use without alt text, and any other checks the site configures. Each result names the document, why it is listed, and its admin link. Use for "what is going stale?", "what needs SEO work?", or a content review. Pass `checks` to run only some of them.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const HEALTH_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(HEALTH_TOOLS)

const inputSchema = z.object({
  checks: z
    .array(z.string())
    .optional()
    .describe('Check ids to run, e.g. ["stale"]. Default: all.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Documents per collection. Default: 10.'),
})

export interface HealthToolDeps {
  payload: Payload
  checks: readonly HealthCheck[]
}

/** The report as the tool returns it: no `where`, and an admin link per row. */
export function toolReport(report: HealthReport, adminRoute: string) {
  return {
    generatedAt: report.generatedAt,
    checks: report.checks.map((check) => ({
      id: check.id,
      label: check.label,
      ...(check.skipped ? { skipped: check.skipped } : {}),
      total: check.groups.reduce((sum, group) => sum + group.total, 0),
      groups: check.groups
        .filter((group) => group.total > 0)
        .map((group) => ({
          collection: group.collection,
          label: group.label,
          total: group.total,
          ...(group.excluded ? { excluded: group.excluded } : {}),
          documents: group.rows.map((row) => ({
            ...row,
            adminUrl: `${adminRoute}/collections/${group.collection}/${String(row.id)}`,
          })),
        })),
    })),
  }
}

export function createFindContentNeedingAttentionTool(
  deps: HealthToolDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    ...HEALTH_TOOLS.findContentNeedingAttention,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return {
          error:
            'Must be authenticated: content health is read with your own access, and an API key alone carries no identity.',
        }
      }
      const known = new Set(deps.checks.map((check) => check.id))
      const unknown = (input.checks ?? []).filter((id) => !known.has(id))
      if (unknown.length > 0) {
        return { error: `Unknown check ${unknown.join(', ')}. Known: ${[...known].join(', ')}.` }
      }
      const report = await findContentNeedingAttention(deps.payload, {
        checks: deps.checks,
        // The same cast and the same reason as publishing's `resolvePublishingActor`.
        user: ctx.user as unknown as PayloadRequest['user'],
        ...(input.checks ? { only: input.checks } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      })
      return toolReport(report, deps.payload.config.routes.admin)
    },
  }
}
