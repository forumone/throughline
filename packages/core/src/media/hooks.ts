import { head, put } from '@vercel/blob'
import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
} from 'payload'
import { isRenderableSvg, sanitizeSvg } from './svg.js'
import { storageKey } from './uploadKey.js'

/*
The hooks that make client uploads to Vercel Blob safe. From forumone-2026's
`collections/Media.ts` and `media/recordStoredFacts.ts` (#486 F-05, #635, #691
there).

**Why hooks, when Payload has `upload.mimeTypes` and `validateSvg`.** With
`clientUploads: true` the browser PUTs straight to Blob and the document
arrives with metadata and no bytes. `generateFileData` returns before
`checkFileRestrictions` for an upload with no buffer, so neither of Payload's own
checks runs. These are the checks that do: two on the way in, two after the
write, when the bytes finally exist somewhere this code can read.

Mount them on the upload collection:

```ts
hooks: {
  beforeChange: [refuseMimeTypesOutside(MIME_TYPES), refuseStorageKeyMismatch()],
  afterChange: [sanitizeStoredSvg(), recordStoredFacts({ mimeTypes: MIME_TYPES })],
}
```

with `uploadPrefixField()` among its fields. The two `afterChange` hooks in that
order: a sanitised SVG is written back over the object and changes its size.
*/

/**
 * `beforeChange`: refuse a type not on the list, on create. The list is the
 * same one given to `upload.mimeTypes`, which does not run on a client upload.
 */
export function refuseMimeTypesOutside(
  allowed: readonly string[],
  message: (mimeType: string) => string = (mimeType) =>
    `${mimeType} is not a type this site accepts.`,
): CollectionBeforeChangeHook {
  return ({ data, operation }) => {
    if (operation !== 'create') return data
    const mimeType = typeof data?.['mimeType'] === 'string' ? data['mimeType'] : ''
    if (mimeType && !allowed.includes(mimeType)) {
      throw new ValidationError({ errors: [{ path: 'mimeType', message: message(mimeType) }] })
    }
    return data
  }
}

/**
 * `beforeChange`: refuse a client upload whose stored key and recorded key
 * disagree, so its link would not resolve.
 *
 * A client upload picks two names independently: the browser PUTs under the
 * name it has, and `generateFileData` may record a different one, say
 * `hero-1.mp4` for a name the collection already holds. Compared against
 * `req.file.name` and the prefix the browser reports back through
 * `clientUploadContext`, which are facts rather than reconstructions. Only where
 * the browser did the uploading: a server-side write is stored under the name
 * Payload chose, and renaming around a collision is right there.
 */
export function refuseStorageKeyMismatch(collectionPrefix = ''): CollectionBeforeChangeHook {
  return ({ data, operation, req }) => {
    if (operation !== 'create') return data
    const file = req?.file
    const context = file?.clientUploadContext
    if (!file || !context) return data

    const written = storageKey(
      {
        prefix: (context as { prefix?: unknown }).prefix as string | undefined,
        filename: file.name,
      },
      collectionPrefix,
    )
    const recorded = storageKey(
      {
        prefix: typeof data?.['prefix'] === 'string' ? data['prefix'] : '',
        filename: typeof data?.['filename'] === 'string' ? data['filename'] : '',
      },
      collectionPrefix,
    )
    if (!written || !recorded || written === recorded) return data

    const sameFolder = written.replace(/[^/]+$/, '') === recorded.replace(/[^/]+$/, '')
    throw new ValidationError({
      errors: [
        {
          path: 'filename',
          message: sameFolder
            ? `A file called ${file.name} is already in the library. This upload was stored under ` +
              `that same name but would have been recorded as ${String(data?.['filename'])}, so its ` +
              `link would not resolve. Rename your file and upload it again.`
            : `This upload was stored at ${written} but the document would have recorded ${recorded}, ` +
              `so its link would not resolve. Nothing is wrong with the file: this is a fault in the ` +
              `upload path itself, and it will affect every upload until it is fixed. Please report it.`,
        },
      ],
    })
  }
}

const tokenOf = (token?: string) => {
  const value = token ?? process.env['BLOB_READ_WRITE_TOKEN']
  return value ? { token: value } : {}
}

/**
 * `afterChange`: re-read an SVG that reached storage, run it through
 * `sanitizeSvg`, and write the clean version over it if anything was removed.
 *
 * After the write because that is the first moment the bytes exist where this
 * code can read them. There is a window between the browser's upload and this
 * finishing during which the original is reachable by URL; closing it means
 * giving up client uploads. Failures are logged and swallowed: a logo that could
 * not be re-read is not a reason to fail a save that has already happened.
 */
export function sanitizeStoredSvg(
  options: { collectionPrefix?: string; token?: string } = {},
): CollectionAfterChangeHook {
  return async ({ doc, operation, req }) => {
    if (operation !== 'create') return doc
    const record = doc as {
      url?: unknown
      mimeType?: unknown
      filename?: string
      prefix?: string | null
    }
    if (record.mimeType !== 'image/svg+xml' || typeof record.url !== 'string') return doc

    try {
      const response = await fetch(record.url)
      if (!response.ok) {
        req.payload.logger.warn(
          `[media] could not re-read ${record.filename} to sanitise it: ${response.status}`,
        )
        return doc
      }
      const { svg, removed } = sanitizeSvg(await response.text())
      if (removed.length === 0) return doc
      if (!isRenderableSvg(svg)) {
        req.payload.logger.error(
          `[media] ${record.filename} was not an SVG once cleaned; leaving it and flagging`,
        )
        return doc
      }
      await put(storageKey(record, options.collectionPrefix), svg, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'image/svg+xml',
        ...tokenOf(options.token),
      })
      req.payload.logger.info(
        `[media] sanitised ${record.filename}, removed: ${removed.join(', ')}`,
      )
    } catch (error) {
      req.payload.logger.warn({ err: error, msg: `[media] sanitising ${record.filename} failed` })
    }
    return doc
  }
}

/** What the store says it is holding. */
export interface StoredObject {
  size: number
  contentType?: string | undefined
}

/** What a media document claims about its own file. */
export interface RecordedFacts {
  filesize?: number | null | undefined
  mimeType?: string | null | undefined
}

/**
 * The fields that contradict the stored object, or `undefined` for none.
 * `mimeType` is corrected only towards a type the collection accepts: a browser
 * that sent `application/octet-stream` would otherwise have that written.
 */
export function factsToCorrect(
  recorded: RecordedFacts,
  stored: StoredObject,
  mimeTypes: readonly string[],
): Partial<{ filesize: number; mimeType: string }> | undefined {
  const correction: Partial<{ filesize: number; mimeType: string }> = {}
  if (stored.size > 0 && stored.size !== recorded.filesize) correction.filesize = stored.size
  const contentType = stored.contentType?.split(';')[0]?.trim()
  if (contentType && contentType !== recorded.mimeType && mimeTypes.includes(contentType)) {
    correction.mimeType = contentType
  }
  return Object.keys(correction).length > 0 ? correction : undefined
}

/**
 * `afterChange`: make `filesize` and `mimeType` describe the object actually in
 * the store.
 *
 * With client uploads, Payload records them from a conversion it ran in memory
 * (it re-fetches the object to apply the default focal point, runs it through
 * sharp, and measures *that* buffer), which was never uploaded: forumone-2026
 * found records wrong by as much as 60%. Nothing before the write can know, so
 * the store is asked, with one `head()` per create. Written through
 * `payload.db.updateOne` so it re-enters no hooks. Failures are logged and
 * swallowed. Skipped for a non-URL `url`, which is local disk, where the file
 * did go through the server and the fields are right.
 */
export function recordStoredFacts(options: {
  mimeTypes: readonly string[]
  token?: string
}): CollectionAfterChangeHook {
  return async ({ doc, operation, req, collection }) => {
    if (operation !== 'create') return doc
    const record = doc as {
      id?: string | number
      filename?: string | null
      url?: string | null
    } & RecordedFacts
    const { url } = record
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return doc

    try {
      const stored = await head(url, tokenOf(options.token))
      const correction = factsToCorrect(record, stored, options.mimeTypes)
      if (!correction || record.id === undefined) return doc

      await req.payload.db.updateOne({
        collection: collection.slug,
        id: record.id,
        data: correction,
        req,
      })
      req.payload.logger.info(
        `[media] ${record.filename}: recorded ${record.mimeType} ${record.filesize}, stored ` +
          `${stored.contentType} ${stored.size}; corrected ${Object.keys(correction).join(' and ')}`,
      )
      return { ...(doc as Record<string, unknown>), ...correction }
    } catch (error) {
      req.payload.logger.warn({
        err: error,
        msg: `[media] could not read ${record.filename} back to check its recorded size`,
      })
      return doc
    }
  }
}
