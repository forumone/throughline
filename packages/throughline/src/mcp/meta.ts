import { z } from 'zod'

/**
 * Optional `_meta` payload Claude can attach to consequential tool calls.
 * The audit writer reads `userPrompt`, `reasoning`, and `changesSummary`
 * to give audit log entries narrative context.
 */
export const McpMetaSchema = z
  .object({
    userPrompt: z.string().optional(),
    reasoning: z.string().optional(),
    changesSummary: z.string().optional(),
  })
  .optional()

export type McpMeta = z.infer<typeof McpMetaSchema>

/**
 * Wraps a Zod object shape in a schema that also accepts an optional `_meta`
 * field. Plugin authors use this for any tool whose input belongs in the
 * audit log:
 *
 * ```ts
 * const inputSchema = withMeta({ pageId: z.string() })
 * type Input = z.infer<typeof inputSchema>  // { pageId: string; _meta?: McpMeta }
 * ```
 */
export function withMeta<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({ ...shape, _meta: McpMetaSchema })
}
