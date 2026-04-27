/**
 * Canonical event taxonomy for Throughline. Server packages add their own
 * events via TypeScript module augmentation — see {@link FrameworkEvents}.
 *
 * The runtime client (created by `createInngestClient`) does not enforce
 * this taxonomy at type-check time; the interface is for documentation and
 * for callers who want to type-check their own `inngest.send(...)` calls.
 */

export interface CoreEvents {
  /** Fired by the audit writer after every audit-log entry is persisted. */
  'audit/event.recorded': {
    data: {
      auditEventId: string
      action: string
      actorId?: string
      targetCollection?: string
      targetId?: string
      approvalRequestId?: string
      integrationId?: string
    }
  }
  /** Fired by the publishing server when a page is published. */
  'content/page.published': {
    data: {
      collection: string
      id: string
      slug: string
      publishedBy: string
      previousPublishedAt: string | null
      isFirstPublish: boolean
    }
  }
  /** Fired when a page is unpublished or reverted to draft. */
  'content/page.unpublished': {
    data: { collection: string; id: string; slug: string; unpublishedBy: string }
  }
  /** Fired when a publish is scheduled for a future time. */
  'content/page.scheduled': {
    data: { collection: string; id: string; scheduledFor: string }
  }
  /** Fired when a page is rolled back to a previous version. */
  'content/page.rolled_back': {
    data: { collection: string; id: string; rolledBackBy: string; toVersionId: string }
  }
  /** Periodic system healthcheck event. */
  'system/healthcheck': {
    data: { source: string; timestamp: string }
  }
}

/**
 * Framework-wide event taxonomy. Server packages extend this interface via
 * TypeScript module augmentation:
 *
 * ```ts
 * declare module '@forumone/throughline-core/events' {
 *   interface FrameworkEvents {
 *     'approval/decided': { data: { approvalId: string; decision: 'granted' | 'declined' } }
 *   }
 * }
 * ```
 *
 * After augmentation, callers in any package can `inngest.send({ name: 'approval/decided', data: ... })`
 * and TypeScript will type-check the payload against the merged set.
 */
// Intentionally empty: server packages augment this interface to add their
// own events. The empty extends keeps CoreEvents as the seed.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FrameworkEvents extends CoreEvents {}
