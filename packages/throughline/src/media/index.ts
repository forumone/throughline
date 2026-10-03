export { isRenderableSvg, sanitizeSvg } from './svg.js'
export type { SanitizedSvg } from './svg.js'
export { storageKey, uniqueUploadPrefix, uploadPrefixField } from './uploadKey.js'
export type { KeyParts } from './uploadKey.js'
export {
  factsToCorrect,
  recordStoredFacts,
  refuseMimeTypesOutside,
  refuseStorageKeyMismatch,
  sanitizeStoredSvg,
} from './hooks.js'
export type { RecordedFacts, StoredObject } from './hooks.js'

// Reference tracking: what refers to a document, the guards that refuse to
// delete or trash it while something does, and the "Used on" panel.
export * from '../references/index.js'
