import { sendEventSafely } from '../../events.js'
import type { PipelineStep } from '../types.js'

/**
 * Performs the actual publish: writes `_status: 'published'`, stamps the
 * publishedAt field on a first publish, then fires `content/page.published`
 * with metadata subscribers can react to (revalidation, integrations, etc.).
 *
 * `publishedAt` is set only when the document does not already have one. It
 * means "when this went live", which is what a listing sorts on and what a
 * template prints on the page — so re-publishing an edit must not move it. It
 * did: every publish overwrote the field with the current time, which sent an
 * edited article to the top of its index and printed today's date on a piece
 * written months ago. An editor who typed the original date into the sidebar
 * watched it be replaced by the act of publishing.
 *
 * The guard is `wasFirstPublish`, which this step already computed for the
 * event payload and did not apply to the write.
 *
 * A document that should genuinely be re-dated is re-dated by editing the
 * field, which now survives.
 *
 * Sets `context.bypassPublishingServer = true` on the Payload update so the
 * status-write blocking hook recognizes this as a sanctioned write. Any
 * other path that tries to flip `_status` will be rejected by the hook.
 *
 * When `actor.enforceAccessAs` is set the write runs as that user with
 * `overrideAccess: false`, so Payload rejects an editor who lacks update
 * access on the collection. Bypassing the hook is not bypassing access
 * control.
 *
 * The event is emitted after the write and cannot fail the step: once
 * `_status` is `published` the publish has happened, and reporting failure
 * would send an editor back to re-publish live content.
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
      ...(wasFirstPublish ? { [ctx.collection.publishedAtField]: now } : {}),
    },
    ...(ctx.actor.enforceAccessAs
      ? { user: ctx.actor.enforceAccessAs, overrideAccess: false }
      : {}),
    context: { bypassPublishingServer: true },
  })

  // The write has landed. From here the publish has happened, so nothing
  // below may turn it back into a failure.
  const warning = await sendEventSafely(ctx.inngest, {
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

  return { pass: true, ...(warning ? { warnings: [warning] } : {}) }
}
