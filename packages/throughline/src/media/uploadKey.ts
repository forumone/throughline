import { randomBytes } from 'node:crypto'
import { getFileKey } from '@payloadcms/plugin-cloud-storage/utilities'
import type { Field } from 'payload'

/*
Where an upload's bytes go, and why every upload gets a folder of its own. From
forumone-2026's `media/uploadKey.ts`.

## The hole this closes

With `@payloadcms/storage-vercel-blob`'s `clientUploads: true`, the browser PUTs
straight to Blob with a token minted with `allowOverwrite: true`, hardcoded. So
the object key is the whole of the access control: anything uploaded under a
key that already exists **replaces** what is there. With the filename as the
key, uploading `hero.mp4` a second time replaced the bytes every page using the
first one showed, live, before any hook ran.

A key nothing else can claim closes it. Two uploads of `hero.mp4` become
`3f9a1c2e7b4d8a60/hero.mp4` and `c81d05f6a29e4b73/hero.mp4`, and the store stops
being enumerable by guessing a filename.

## Why a prefix rather than the adapter's random suffix

`addRandomSuffix` returns one Blob-chosen pathname for the original and every
generated size under a single key, and Payload flattens those so a crop's name
lands on the document. The prefix is a first-class part of the cloud-storage
plugin instead: `getFileKey` joins it, `generateURL` and `deleteFile` read it
back off the document, and the name Payload records stays the editor's.

## The one thing to be careful with

**Existing documents must never acquire a prefix.** The plugin recomputes `url`
from `prefix` on every read, and Payload fills a field's `defaultValue` whenever
the stored value is `undefined`, so adding `uploadPrefixField` to a collection
with documents would give every one of them a fresh folder on read, and every
file would 404. The migration that adds the column must backfill `''`: an empty
string is a value, so the default never fires, and `getFileKey` joins it to
nothing.
*/

/**
 * A folder for one upload: eight bytes, hex. Unguessable is the requirement, not
 * uniqueness, and `randomBytes` rather than `Math.random` because this is the
 * only thing between one upload and another's file.
 */
export function uniqueUploadPrefix(): string {
  return randomBytes(8).toString('hex')
}

/**
 * The `prefix` field: generated once when the document's form is built, hidden,
 * and read by the cloud-storage plugin. See the warning above before adding it
 * to a collection that already has documents.
 */
export function uploadPrefixField(): Field {
  return {
    name: 'prefix',
    type: 'text',
    admin: { hidden: true, readOnly: true },
    defaultValue: () => uniqueUploadPrefix(),
  }
}

/** What a media document says about where its file is. */
export interface KeyParts {
  prefix?: string | null | undefined
  filename?: string | null | undefined
}

/**
 * The object key for a document's own file, through the plugin's `getFileKey`
 * so it cannot drift from the key the plugin writes. `collectionPrefix` is the
 * adapter's own `prefix` option, empty unless configured.
 */
export function storageKey({ prefix, filename }: KeyParts, collectionPrefix = ''): string {
  if (!filename) return ''
  const { fileKey } = getFileKey({ collectionPrefix, docPrefix: prefix ?? '', filename })
  return fileKey
}
