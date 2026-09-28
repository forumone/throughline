/**
 * Client entry point for the admin components the generated blocks reference,
 * as `@forumone/throughline-design-system-payload/client#RowSummary` in
 * Payload's import map.
 *
 * Kept apart from the package root and `./generate`, which run inside
 * `payload.config.ts`, so the config never pulls in `@payloadcms/ui`.
 */
export { RowSummary } from './admin/RowSummary'
export type { RowSummaryProps } from './admin/RowSummary'
