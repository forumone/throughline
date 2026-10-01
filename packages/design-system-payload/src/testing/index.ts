/**
 * Test helpers for a site's generated blocks, as
 * `@forumone/throughline-design-system-payload/testing`.
 *
 * Kept apart from the package root and `./generate`, which run inside
 * `payload.config.ts`, because `describeBlockInvariants` imports `vitest` — an
 * optional peer a running site never loads. The contract/component check is
 * also a bin, `check-block-props`.
 */
export { describeBlockInvariants } from './describeBlockInvariants'
export type { BlockInvariantOptions } from './describeBlockInvariants'
export {
  checkUntouchedBlocks,
  untouchedData,
  validateCases,
  validateOptions,
} from './untouchedBlocks'
export type { UntouchedFailure, UntouchedRows, ValidateCase } from './untouchedBlocks'
export { defaultMismatches } from './contractDefaults'
export type { DefaultMismatch } from './contractDefaults'
export {
  argsFileLoader,
  checkBlockProps,
  compareShapes,
  formatBlockPropsResult,
  kindOf,
  storedObject,
  storedValue,
  stubCoerceContext,
} from './checkBlockProps'
export type {
  CheckBlockPropsOptions,
  CheckBlockPropsResult,
  PropKind,
  PropMismatch,
  PropsManifest,
} from './checkBlockProps'
