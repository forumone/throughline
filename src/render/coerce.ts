import type { ReactNode } from 'react'
import { fieldOverride, type Overrides } from '../overrides'
import type { ContentField } from '../generate/fields'

/**
 * What Payload stores is not what a component takes.
 *
 * An `image` field is a media id or a populated document; the component wants
 * a URL. A `link` is a group with a mode and a relationship; the component
 * wants an href. An `array` row carries Payload's own `id`, which the component
 * has no field for. Coercion is that translation, and it is driven by the same
 * `ContentField[]` the block was generated from — so the two cannot describe
 * different shapes.
 */

export interface MediaLike {
  url?: string | null
  alt?: string | null
  filename?: string | null
  /**
   * The stored file's own width. The host uses it to keep a `srcSet` from
   * offering candidates larger than the original, which no optimizer can
   * produce and which would therefore all be the same bytes.
   */
  width?: number | null
  /**
   * Candidate widths for the same image, as a `srcset` value. Optional: a host
   * with no image pipeline resolves a `url` and nothing else, and every
   * component treats `srcSet` as absent rather than empty.
   */
  srcSet?: string | null
  /**
   * How wide the image is drawn, as a `sizes` value. Ignored without a
   * `srcSet`, which is the only thing it selects from.
   */
  sizes?: string | null
  /**
   * The stored file's own mime type. The media collection accepts video as
   * well as images, and the two cannot be treated alike: a host that resizes
   * images through an optimizer has to leave an `video/mp4` URL alone, because
   * an image optimizer handed a video returns nothing it can play.
   */
  mimeType?: string | null
}

export interface LinkValue {
  mode?: ('internal' | 'external' | 'anchor') | null
  reference?: { relationTo: string; value: unknown } | null
  url?: string | null
  anchor?: string | null
  newTab?: boolean | null
}

export interface CoerceContext {
  overrides: Overrides
  /** Turns a stored media value into a URL. Null when it cannot be resolved. */
  /**
   * Turns a stored upload into a media document.
   *
   * `where` names the component and field the image is for — `CardGrid` /
   * `items.image`, `ImageHero` / `image.src`. The host uses it to decide how
   * large the image needs to be, which it cannot know from the value alone: a
   * card and a full-bleed hero hold the same shape and want very different
   * numbers of pixels.
   */
  resolveMedia: (value: unknown, where: { component: string; path: string }) => MediaLike | null
  /** Turns an internal reference into a path. */
  resolveHref: (link: LinkValue) => string | undefined
  /** Turns Lexical state into React. Project-specific, so it is injected. */
  renderRichText: (value: unknown) => ReactNode
  /** Turns an icon name into a rendered glyph. */
  renderIcon: (name: string) => ReactNode
}

/**
 * Drops a key entirely rather than passing `undefined`.
 *
 * `exactOptionalPropertyTypes` is on, so `{ heading: undefined }` is not
 * assignable to `{ heading?: string }`. Every optional prop has to be absent
 * rather than explicitly undefined, and there are several hundred of them.
 */

/**
 * Whether a stored value amounts to nothing, all the way down.
 *
 * `mode` is skipped because `linkField` gives it a default: it says which kind
 * of link this *would* be, and is present whether or not anybody chose
 * anything. The same reasoning as the group validation in `generate/fields.ts`,
 * and the two have to agree — one decides whether a group may be saved, the
 * other whether it reaches a component.
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.every(isEmptyValue)
  if (typeof value === 'object') {
    return Object.entries(value).every(([key, held]) => key === 'mode' || isEmptyValue(held))
  }
  return false
}

function put(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  target[key] = value
}

/**
 * The props that carry an image's candidate widths, beside the one that carries
 * its URL.
 *
 * The design system names them by suffixing the image's own prop — `image` has
 * `imageSrcSet` and `imageSizes`, `poster` has `posterSrcSet` and
 * `posterSizes` — except where the image prop is already called `src`, inside
 * an `ImageRef` group or array row, where the siblings are the bare `srcSet`
 * and `sizes` of the HTML attributes.
 *
 * They are not fields in any contract, and must not become ones: a `srcset` is
 * not content an author writes, it is what an optimizer computed. So the CMS
 * offers `src` and `alt`, `resolveMedia` returns the rest, and this is the one
 * place that knows where they go.
 */
function responsiveProps(imageProp: string): { srcSet: string; sizes: string } {
  return imageProp === 'src'
    ? { srcSet: 'srcSet', sizes: 'sizes' }
    : { srcSet: `${imageProp}SrcSet`, sizes: `${imageProp}Sizes` }
}

/**
 * Writes one field into `target` under the prop name — or names — it maps to.
 *
 * Every field but an image is one key. An image is up to three, which is why
 * this exists rather than the three call sites each putting a single returned
 * value.
 */
function putField(
  target: Record<string, unknown>,
  component: string,
  field: ContentField,
  value: unknown,
  ctx: CoerceContext,
  path: string,
): void {
  const override = fieldOverride(ctx.overrides, component, path)
  if (override?.omit) return

  // The one name mismatch in the system — ArticleBody's `body` is the
  // component's `children` — declared in the overrides so the generator and
  // this agree by construction rather than by memory.
  const name = override?.propName ?? field.name

  if (field.type === 'image' && override?.as !== 'icon' && value !== undefined && value !== null) {
    const media = ctx.resolveMedia(value, { component, path })
    if (!media?.url) return
    const responsive = responsiveProps(name)
    put(target, name, media.url)
    put(target, responsive.srcSet, media.srcSet)
    put(target, responsive.sizes, media.sizes)
    return
  }

  /*
  An uploaded video is one key, never three. A `srcset` picks between candidate
  widths of the same picture, and there are no candidate widths of a video file
  — the browser cannot re-encode one, and offering `videoSrcSet` would put a
  prop on the component that no component takes.
  */
  if (
    field.type === 'video' &&
    override?.as === 'videoUpload' &&
    value !== undefined &&
    value !== null
  ) {
    const media = ctx.resolveMedia(value, { component, path })
    if (!media?.url) return
    put(target, name, media.url)
    return
  }

  put(target, name, coerceField(component, field, value, ctx, path))
}

/** One component's block data, as props. */
export function coerceBlock(
  component: string,
  fields: ContentField[],
  data: Record<string, unknown>,
  ctx: CoerceContext,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}

  for (const field of fields) {
    putField(props, component, field, data[field.name], ctx, field.name)
  }

  return props
}

function coerceField(
  component: string,
  field: ContentField,
  value: unknown,
  ctx: CoerceContext,
  path: string,
): unknown {
  if (value === undefined || value === null) return undefined
  const override = fieldOverride(ctx.overrides, component, path)

  if (override?.as === 'icon' && typeof value === 'string') {
    return ctx.renderIcon(value)
  }

  switch (field.type) {
    case 'text':
    case 'video':
    case 'select':
    case 'number':
      return value

    case 'boolean':
      return Boolean(value)

    case 'richtext':
      return ctx.renderRichText(value)

    /*
    The URL alone, with no responsive siblings — because there is nowhere to put
    them. This branch is only reached through the scalar-array path below, where
    a row *is* its single value and has no object to hold a `srcSet` beside it.
    Every image field in the design system today arrives through `putField`
    instead; no contract has a single-image-child array. If one ever does, its
    images will be right-sized but not responsive, and the fix is a row object
    rather than a scalar.
    */
    case 'image': {
      const media = ctx.resolveMedia(value, { component, path })
      return media?.url ?? undefined
    }

    case 'link':
      return ctx.resolveHref(value as LinkValue)

    case 'group': {
      // A slot: no children in the contract, nothing stored, nothing to pass.
      if (!field.of) return undefined
      /*
      An untouched optional group must arrive as `undefined`, not as an object
      of empty values.

      Payload stores one either way — `ChallengeOverview.caseStudy` comes back
      as `{ stat: {}, href: { mode: 'internal' } }` when nobody has filled it
      in, because `linkField` defaults `mode`. Passed through, that is truthy,
      and a component guarding with `{caseStudy && <RelatedCard ... />}` renders
      a card with no title: an empty `<h3>` in the page, which is an axe
      violation and a heading a screen reader announces as nothing.
      */
      if (isEmptyValue(value)) return undefined
      const nested = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const child of field.of) {
        putField(out, component, child, nested[child.name], ctx, `${path}.${child.name}`)
      }
      return Object.keys(out).length > 0 ? out : undefined
    }

    case 'array': {
      if (!field.of || !Array.isArray(value)) return undefined

      /*
      An array of primitives comes back as an array of primitives.

      A contract that says `tags: string[]` is expressed in the manifest as an
      array whose `of` is a single `text` child — `[{ name: 'tag' }]` — because
      Payload has no bare array-of-strings field and a row needs a column to
      live in. Mapping every row to an object regardless turns `['AI']` into
      `[{ tag: 'AI' }]`, which type-checks nowhere and renders as
      `[object Object]`.

      Every one of the 24 single-child arrays in the design system is a scalar
      array — `KeyPoints.points`, `TagList.tags`, `AudioPlayer.speeds` (numbers,
      hence coercing the value rather than stringifying it), `TextHero.logos`.
      Checked against each component's own prop type, not inferred from the
      shape. If a genuine one-field *object* row ever appears, this is where it
      breaks, and the fix is a marker in the contract rather than a guess here.
      */
      const [only] = field.of
      if (field.of.length === 1 && only && !only.of) {
        return value
          .map(row =>
            coerceField(
              component,
              only,
              (row as Record<string, unknown>)[only.name],
              ctx,
              `${path}.${only.name}`,
            ),
          )
          .filter(entry => entry !== undefined)
      }

      return value.map(row => {
        const source = row as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const child of field.of ?? []) {
          putField(out, component, child, source[child.name], ctx, `${path}.${child.name}`)
        }
        // `id` is Payload's row key. The component has no such prop, and React
        // would pass it straight through to the DOM.
        return out
      })
    }
  }
}
