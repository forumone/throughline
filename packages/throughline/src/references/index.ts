export { couldReference, pointsAt, referencesIn, referencesTo, walkDocument } from './walk.js'
export type {
  Reference,
  ReferencesInOptions,
  WalkDocumentOptions,
  WalkLocation,
  WalkVisitor,
} from './walk.js'

export { LINK_TARGET_KEY, linkTargetMarker, linkTargetsIn, markLinkTarget } from './links.js'
export type { LinkTarget, LinkTargetMarker, LinkTargetsInOptions } from './links.js'

export { blockRegistry, describeReferences, findReferencedIds, findReferences } from './find.js'
export type { DocumentReferences, FindReferencesOptions } from './find.js'

export {
  movesToTrash,
  referenceRefusal,
  refuseDeleteWhileReferenced,
  refuseTrashWhileReferenced,
} from './guards.js'
export type { ReferenceGuardOptions } from './guards.js'

export {
  REFERENCE_TOOLS,
  REFERENCE_TOOL_DESCRIPTORS,
  createCanDeleteTool,
  createFindReferencesTool,
} from './tools.js'
export type { ReferenceToolDeps } from './tools.js'

export { USED_ON_FIELD, USED_ON_PANEL_PATH, referencesPlugin } from './plugin.js'
export type { ReferenceCollectionOptions, ReferencesPluginOptions } from './plugin.js'
