import { describe, expect, it } from 'vitest'
import { factsToCorrect } from './hooks.js'

/** forumone-2026's list, which these cases were measured against. */
const MEDIA_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'application/pdf',
  'video/mp4',
] as const

/*
What a media document says about its file, against what the store holds.

The measurement this exists for, from a clean upload through the production
admin on 2026-09-15:

    #372  March_of_Dimes_logo.webp
      mimeType   image/webp
      filesize   6762          <- the record
      blob       4282 bytes    <- the object it points at

Both fields described a webp conversion `generateFileData` performed in memory
and nothing uploaded. `filesize` is the obvious thing for a script to match on,
and the first version of #618's repair script did exactly that and matched
nothing at all. #635.
*/

describe('factsToCorrect', () => {
  it('corrects the size to the bytes the store is holding', () => {
    // The real numbers off #372.
    expect(
      factsToCorrect(
        { filesize: 6762, mimeType: 'image/webp' },
        { size: 4282, contentType: 'image/webp' },
        MEDIA_MIME_TYPES,
      ),
    ).toEqual({ filesize: 4282 })
  })

  it('corrects the type when the stored file is not what was recorded', () => {
    // #618's sixteen: the record said `image/webp` of a PNG.
    expect(
      factsToCorrect(
        { filesize: 6762, mimeType: 'image/webp' },
        { size: 4282, contentType: 'image/png' },
        MEDIA_MIME_TYPES,
      ),
    ).toEqual({ filesize: 4282, mimeType: 'image/png' })
  })

  it('says nothing when the record is already true', () => {
    // The common case, and the one that must cost no write: an upload whose
    // extension agrees with its type is right as Payload recorded it.
    expect(
      factsToCorrect(
        { filesize: 4282, mimeType: 'image/webp' },
        { size: 4282, contentType: 'image/webp' },
        MEDIA_MIME_TYPES,
      ),
    ).toBeUndefined()
  })

  it('reads a charset off the stored content type before comparing', () => {
    // Blob returns what the uploader set, and a browser will happily send
    // `image/svg+xml; charset=utf-8`. Writing that verbatim would make the
    // record disagree with the allowlist over punctuation.
    expect(
      factsToCorrect(
        { filesize: 900, mimeType: 'image/svg+xml' },
        { size: 900, contentType: 'image/svg+xml; charset=utf-8' },
        MEDIA_MIME_TYPES,
      ),
    ).toBeUndefined()
  })

  /*
  A client upload sets its own content type, so the store can be holding
  something this collection would refuse. Recording it would be worse than the
  conversion target it replaces — `Media.beforeChange` checks the same list and
  would refuse the document on its next save — so the size is corrected and the
  type is left as it was.
  */
  it('will not write a type this collection does not accept', () => {
    expect(
      factsToCorrect(
        { filesize: 6762, mimeType: 'image/webp' },
        { size: 4282, contentType: 'application/octet-stream' },
        MEDIA_MIME_TYPES,
      ),
    ).toEqual({ filesize: 4282 })

    expect((MEDIA_MIME_TYPES as readonly string[]).includes('application/octet-stream')).toBe(false)
  })

  it('ignores a store that reports nothing useful', () => {
    // A zero-byte answer is a store that could not tell us, not a file that is
    // empty — and overwriting a true size with 0 is the one outcome worse than
    // leaving it wrong.
    expect(
      factsToCorrect({ filesize: 6762, mimeType: 'image/webp' }, { size: 0 }, MEDIA_MIME_TYPES),
    ).toBeUndefined()
  })

  it('fills in fields the record never had', () => {
    // A document written by a script rather than by the admin.
    expect(factsToCorrect({}, { size: 4282, contentType: 'image/png' }, MEDIA_MIME_TYPES)).toEqual({
      filesize: 4282,
      mimeType: 'image/png',
    })
  })
})
