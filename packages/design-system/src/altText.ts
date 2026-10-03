import type { ContentField } from './generate/fields.js'

/*
An image's alt text, beside the image, falls back to the media library's.

The media collection asks for alt at upload, where the person who chose the
image is still looking at it. A block that holds that image used to ask again,
and render only what it was told — so the same description was typed twice,
or not at all and the image went out as decorative. Now the block's own alt is
an override: left empty, the media document's alt is used.

Pairing is by name, the same convention `responsiveProps` in `render/coerce.ts`
relies on: an image prop `image` has its alt in `imageAlt`, except where the
image prop is `src` inside an `ImageRef` group or row, whose alt is the bare
`alt` of the HTML attribute. Only siblings pair — the image and its alt have to
sit in the same block, group or array row.
*/

/** The name of the field that carries an image field's alt text. */
export function altFieldFor(imageField: string): string {
  return imageField === 'src' ? 'alt' : `${imageField}Alt`
}

/** Image field name → alt field name, for every image among `siblings` that has one. */
export function pairedAltFields(siblings: readonly ContentField[]): Map<string, string> {
  const names = new Set(siblings.map(field => field.name))
  const pairs = new Map<string, string>()
  for (const field of siblings) {
    if (field.type !== 'image') continue
    const alt = altFieldFor(field.name)
    if (names.has(alt)) pairs.set(field.name, alt)
  }
  return pairs
}

/** Told to the author beside every alt field that falls back. */
export const ALT_FALLBACK_NOTE = 'Leave empty to use the alt text from the media library.'

/**
 * `siblings`, with every paired alt field made optional and saying why.
 *
 * Optional because a required alt would make the author type the fallback by
 * hand, which is the duplication this exists to remove. Nothing is lost: the
 * media collection already refuses an image without alt.
 */
export function withAltFallback(siblings: readonly ContentField[]): ContentField[] {
  const alts = new Set(pairedAltFields(siblings).values())
  return siblings.map(field =>
    alts.has(field.name)
      ? {
          ...field,
          required: false,
          constraints: field.constraints
            ? `${field.constraints} ${ALT_FALLBACK_NOTE}`
            : ALT_FALLBACK_NOTE,
        }
      : field,
  )
}
