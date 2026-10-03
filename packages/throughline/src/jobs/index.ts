/**
 * `@forumone/throughline/jobs`: the event taxonomy every job is written
 * against. Extend it with module augmentation:
 *
 * ```ts
 * declare module '@forumone/throughline/jobs' {
 *   interface CoreEvents { 'site/thing.happened': { id: string } }
 * }
 * ```
 *
 * `defineJob` and the job types arrive here from `@forumone/throughline-workflows`
 * in a later 1.0 step (docs/spec/1.0-exports.md).
 */
export type { CoreEvents, FrameworkEvents } from '../events/taxonomy.js'
