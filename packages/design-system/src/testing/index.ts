/**
 * Test helpers for a site's generated blocks, as
 * `@forumone/throughline-design-system/testing`.
 *
 * Kept apart from the package root and `./generate`, which run inside
 * `payload.config.ts`, because `describeBlockInvariants` imports `vitest` — an
 * optional peer a running site never loads. The contract/component check is
 * also a bin, `check-block-props`.
 */
export { describeBlockInvariants } from './describeBlockInvariants.js'
export type { BlockInvariantOptions } from './describeBlockInvariants.js'
export {
  checkUntouchedBlocks,
  untouchedData,
  validateCases,
  validateOptions,
} from './untouchedBlocks.js'
export type { UntouchedFailure, UntouchedRows, ValidateCase } from './untouchedBlocks.js'
export { defaultMismatches } from './contractDefaults.js'
export type { DefaultMismatch } from './contractDefaults.js'
export {
  argsFileLoader,
  checkBlockProps,
  compareShapes,
  formatBlockPropsResult,
  kindOf,
  storedObject,
  storedValue,
  stubCoerceContext,
} from './checkBlockProps.js'
export type {
  CheckBlockPropsOptions,
  CheckBlockPropsResult,
  PropKind,
  PropMismatch,
  PropsManifest,
} from './checkBlockProps.js'
