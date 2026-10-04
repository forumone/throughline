import { componentDisplayName } from '@forumone/throughline-design-system/contract'
import {
  type BlockLike,
  type FieldConfig,
  type FieldLike,
  describeFieldPath,
  findBlock,
  findField,
  labelText,
} from '../../utils/field-path.js'
import type { PipelineContext, PipelineIssue } from './types.js'

/*
Where an issue is, in the editor's words. forumone-2026#805.

Every issue a step returns gains a `where` — `Block 3 (Image Hero) › Image`,
`SEO › Title` — from the collection's own field config, by
`describeFieldPath`. So a site's own checks get it too, report a path, and
never have to know a label.
*/

export { describeFieldPath, type FieldConfig } from '../../utils/field-path.js'

/** The config for `ctx.collection`, or `undefined` when Payload has none to give. */
export function fieldConfigFor(
  ctx: Pick<PipelineContext, 'payload' | 'collection'>,
): FieldConfig | undefined {
  const payload = ctx.payload as unknown as {
    collections?: Record<string, { config?: { fields?: FieldLike[] } } | undefined>
    config?: { blocks?: BlockLike[] }
  }
  const fields = payload.collections?.[ctx.collection.slug]?.config?.fields
  if (!Array.isArray(fields)) return undefined
  return {
    fields,
    ...(Array.isArray(payload.config?.blocks) ? { blocks: payload.config.blocks } : {}),
    layoutField: ctx.collection.layoutField,
  }
}

/**
 * The label a block of `type` has in the collection's layout field, or the
 * component's display name when the config does not say.
 */
export function blockLabel(config: FieldConfig | undefined, type: string): string {
  const layout =
    config?.layoutField !== undefined ? findField(config.fields, config.layoutField)?.field : undefined
  const block = layout?.type === 'blocks' && config ? findBlock(layout, type, config) : undefined
  return labelText(block?.labels?.singular) ?? componentDisplayName(type)
}

/** Fills in `where` on every issue whose path can be described. */
export function withWhere(
  issues: PipelineIssue[],
  config: FieldConfig | undefined,
  document: Record<string, unknown>,
): PipelineIssue[] {
  if (!config) return issues
  return issues.map((issue) => {
    if (issue.where || !issue.field) return issue
    const where = describeFieldPath(issue.field, config, document)
    return where ? { ...issue, where } : issue
  })
}
