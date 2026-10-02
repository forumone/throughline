import { describe, expect, it } from 'vitest'
import { storageKey, uniqueUploadPrefix } from './uploadKey.js'

/*
The key is the only access control an upload has.

`getClientUploadRoute.js:21` mints the browser's token with
`allowOverwrite: true` hardcoded, so anything PUT under an existing key replaces
what is there. A folder per upload is what stops a second `hero_si.mp4` landing
on the first one's bytes — #691 could only refuse the document that resulted,
because the PUT happens before any hook runs.
*/
describe('uniqueUploadPrefix', () => {
  it('is hex, and long enough not to be guessed', () => {
    expect(uniqueUploadPrefix()).toMatch(/^[0-9a-f]{16}$/)
  })

  /*
  The property the whole change rests on. A prefix that repeated would put two
  uploads in one folder and hand the second the first's filename to overwrite,
  which is the bug this exists to close.
  */
  it('does not repeat', () => {
    const drawn = new Set(Array.from({ length: 1000 }, () => uniqueUploadPrefix()))
    expect(drawn.size).toBe(1000)
  })

  /*
  It goes into an object key and a URL path, so anything needing escaping would
  make the document's key and the browser's key diverge through two different
  sanitisers — the divergence `Media.beforeChange` exists to catch.
  */
  it('needs no escaping in a path', () => {
    const prefix = uniqueUploadPrefix()
    expect(encodeURIComponent(prefix)).toBe(prefix)
  })
})

describe('storageKey', () => {
  it('puts the file in its folder', () => {
    expect(storageKey({ prefix: '3f9a1c2e7b4d8a60', filename: 'hero_si.mp4' })).toBe(
      '3f9a1c2e7b4d8a60/hero_si.mp4',
    )
  })

  /*
  Every document written before the prefix existed. The migration backfills `''`
  rather than leaving NULL — see the field's own comment — and this is the half
  that says an empty string changes nothing about where their files are.
  */
  it('leaves a document with no prefix exactly where it was', () => {
    expect(storageKey({ prefix: '', filename: 'logo_nrdc.svg' })).toBe('logo_nrdc.svg')
  })

  it('treats null and undefined as no prefix', () => {
    expect(storageKey({ prefix: null, filename: 'logo_nrdc.svg' })).toBe('logo_nrdc.svg')
    expect(storageKey({ filename: 'logo_nrdc.svg' })).toBe('logo_nrdc.svg')
  })

  /*
  Two uploads of one name are the case that used to overwrite. They have to come
  out as different keys or none of this works.
  */
  it('keeps two uploads of the same name apart', () => {
    const one = storageKey({ prefix: uniqueUploadPrefix(), filename: 'hero_si.mp4' })
    const two = storageKey({ prefix: uniqueUploadPrefix(), filename: 'hero_si.mp4' })
    expect(one).not.toBe(two)
  })

  it('has nothing to say about a document with no file', () => {
    expect(storageKey({ prefix: 'abc', filename: '' })).toBe('')
    expect(storageKey({ prefix: 'abc' })).toBe('')
  })

  /*
  Through the plugin's own `getFileKey`, so the sanitising cannot drift from the
  browser's. A prefix that tried to climb out of its folder is flattened by
  `sanitizePrefix` on both sides identically.
  */
  it('refuses to let a prefix climb out of itself', () => {
    expect(storageKey({ prefix: '../../etc', filename: 'passwd' })).toBe('etc/passwd')
  })
})
