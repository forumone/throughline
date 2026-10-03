/**
 * Client entry point for the admin components the generated blocks reference,
 * as `@forumone/throughline-design-system/client#RowSummary` in
 * Payload's import map.
 *
 * Kept apart from the package root and `./generate`, which run inside
 * `payload.config.ts`, so the config never pulls in `@payloadcms/ui`.
 */
export { BlockGuidance } from './admin/BlockGuidance.js'
export type { BlockGuidanceProps } from './admin/BlockGuidance.js'
export { BlockSummary } from './admin/BlockSummary.js'
export type { BlockSummaryProps } from './admin/BlockSummary.js'
export { RowSummary } from './admin/RowSummary.js'
export type { RowSummaryProps } from './admin/RowSummary.js'
