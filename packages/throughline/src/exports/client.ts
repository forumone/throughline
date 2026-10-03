/**
 * Client components for the admin, referenced from Payload's import map as
 * `@forumone/throughline/client#CharacterCountText`.
 *
 * Kept off the package root so a server-only consumer never loads React or
 * `@payloadcms/ui`.
 */
export { CharacterCountText, CharacterCountTextarea } from '../fields/CharacterCountField.js'
