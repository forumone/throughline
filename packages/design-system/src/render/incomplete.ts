import { fieldOverride, type Overrides } from '../overrides.js'
import type { ContentField } from '../generate/fields.js'

/*
A block whose required image did not arrive. forumone-2026#840.

A component trusts its contract: an image the contract requires is read as
`item.image.src` with no guard, because a published block cannot lack one —
publishing refuses an empty required field. A draft can, by design, and so can
a published block whose image no longer resolves. Rendered anyway, the
component throws on `undefined.src`, and one card takes the whole page down
with it: Live Preview showed the site's error page for a landing page with one
empty image slot.

So the props are checked against the contract after coercion, which is when
"no usable image" is known — an id for a media document that is gone resolves
to nothing, exactly as an empty slot does — and the block is handed to the host
to decide about instead of to the component.

Images only, deliberately. A missing image is the shape that throws; an empty
required heading renders an empty heading, which the publish checks catch and
which does not take a page down.

Paths are the contract's names with row numbers, `items[1].image.src`, for a
host to put in front of an editor.
*/
export function missingRequiredImages(
  component: string,
  fields: readonly ContentField[],
  props: Record<string, unknown>,
  overrides: Overrides,
  parentPath = '',
  displayPath = '',
): string[] {
  const out: string[] = []
  for (const field of fields) {
    const path = parentPath ? `${parentPath}.${field.name}` : field.name
    const shown = displayPath ? `${displayPath}.${field.name}` : field.name
    const override = fieldOverride(overrides, component, path)
    if (override?.omit || override?.as === 'icon') continue
    const value = props[override?.propName ?? field.name]

    if (field.type === 'image') {
      if (field.required && (typeof value !== 'string' || value === '')) out.push(shown)
      continue
    }

    if (field.type === 'group' && field.of) {
      if (value && typeof value === 'object') {
        out.push(
          ...missingRequiredImages(
            component,
            field.of,
            value as Record<string, unknown>,
            overrides,
            path,
            shown,
          ),
        )
      } else if (field.required && containsRequiredImage(field.of)) {
        out.push(shown)
      }
      continue
    }

    if (field.type === 'array' && field.of && Array.isArray(value)) {
      value.forEach((row, index) => {
        if (!row || typeof row !== 'object') return
        out.push(
          ...missingRequiredImages(
            component,
            field.of ?? [],
            row as Record<string, unknown>,
            overrides,
            path,
            `${shown}[${index}]`,
          ),
        )
      })
    }
  }
  return out
}

function containsRequiredImage(fields: readonly ContentField[]): boolean {
  return fields.some(
    (field) =>
      (field.type === 'image' && field.required) ||
      (field.type === 'group' &&
        field.required &&
        field.of !== undefined &&
        containsRequiredImage(field.of)),
  )
}
