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
function put(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  target[key] = value
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
    const override = fieldOverride(ctx.overrides, component, field.name)
    if (override?.omit) continue

    const value = coerceField(component, field, data[field.name], ctx, field.name)
    // The one name mismatch in the system — ArticleBody's `body` is the
    // component's `children` — declared in the overrides so the generator and
    // this agree by construction rather than by memory.
    put(props, override?.propName ?? field.name, value)
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

    case 'image': {
      const media = ctx.resolveMedia(value, { component, path })
      return media?.url ?? undefined
    }

    case 'link':
      return ctx.resolveHref(value as LinkValue)

    case 'group': {
      // A slot: no children in the contract, nothing stored, nothing to pass.
      if (!field.of) return undefined
      const nested = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const child of field.of) {
        put(
          out,
          fieldOverride(ctx.overrides, component, `${path}.${child.name}`)?.propName ?? child.name,
          coerceField(component, child, nested[child.name], ctx, `${path}.${child.name}`),
        )
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
          put(
            out,
            fieldOverride(ctx.overrides, component, `${path}.${child.name}`)?.propName ??
              child.name,
            coerceField(component, child, source[child.name], ctx, `${path}.${child.name}`),
          )
        }
        // `id` is Payload's row key. The component has no such prop, and React
        // would pass it straight through to the DOM.
        return out
      })
    }
  }
}
