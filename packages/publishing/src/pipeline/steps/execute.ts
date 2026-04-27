import type { PipelineStep } from '../types.js'

/**
 * Performs the actual publish: writes `_status: 'published'` and updates
 * the publishedAt field, then fires `content/page.published` with metadata
 * subscribers can react to (revalidation, integrations, etc.).
 *
 * Sets `context.bypassPublishingServer = true` on the Payload update so the
 * status-write blocking hook recognizes this as a sanctioned write. Any
 * other path that tries to flip `_status` will be rejected by the hook.
 */
export const executeStep: PipelineStep = async (ctx) => {
  const now = new Date().toISOString()
  const previousPublishedAt =
    typeof ctx.document[ctx.collection.publishedAtField] === 'string'
      ? (ctx.document[ctx.collection.publishedAtField] as string)
      : null
  const wasFirstPublish = previousPublishedAt === null

  await ctx.payload.update({
    collection: ctx.collection.slug,
    id: ctx.documentId,
    data: {
      _status: 'published',
      [ctx.collection.publishedAtField]: now,
    },
    context: { bypassPublishingServer: true },
  })

  await ctx.inngest.send({
    name: 'content/page.published',
    data: {
      collection: ctx.collection.slug,
      id: ctx.documentId,
      slug: String(ctx.document[ctx.collection.slugField] ?? ctx.documentId),
      publishedBy: ctx.actor.user?.id ?? 'system',
      previousPublishedAt,
      isFirstPublish: wasFirstPublish,
    },
  })

  return { pass: true }
}
