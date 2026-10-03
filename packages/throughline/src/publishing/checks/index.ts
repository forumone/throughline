import { altTextCheck } from './alt-text.js'
import { headingHierarchyCheck } from './heading-hierarchy.js'
import { linkLabelsCheck } from './link-labels.js'

export { altTextCheck } from './alt-text.js'
export { headingHierarchyCheck } from './heading-hierarchy.js'
export { linkLabelsCheck } from './link-labels.js'

/** Built-in accessibility checks the pipeline runs before any user-supplied ones. */
export const BUILT_IN_ACCESSIBILITY_CHECKS = [
  altTextCheck,
  headingHierarchyCheck,
  linkLabelsCheck,
] as const
