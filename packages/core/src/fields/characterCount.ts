import type { Config, Field, Plugin } from 'payload'
import { mapFields } from './mapFields.js'

/*
Every capped text field gets a counter, and a cap it cannot be typed past. From
forumone-2026's `fields/characterCount`.

`maxLength` is enforced by Payload at save, so the limit was invisible right up
to the moment it cost somebody what they had just written: fill a 160-character
heading with four hundred words, press Publish, and read "The following field is
invalid". This moves the limit to where the typing happens.

## A pass over the built config, and last

There can be hundreds of capped fields once a design system's blocks are
generated from their contracts, so hand-editing them would be out of date the
next time a contract changes. One rule instead, applied to whatever is there:
a `text` or `textarea` field with a `maxLength` gets the control.

Register it **after** every plugin that adds capped fields. `@payloadcms/plugin-seo`
contributes `meta.title` and `meta.description`; running before it would miss
both. (Those two are then skipped anyway, because the SEO plugin ships its own
counted controls.)

## What it leaves alone

- A field that already has a custom `Field` component: replacing it would trade a
  purpose-built control for a generic one.
- `hasMany` text, which Payload renders as a multi-value select.
- Anything with no `maxLength`: a counter with no denominator is noise.
*/

/** Where Payload finds the replacement controls. */
export const CHARACTER_COUNT_TEXT_PATH = '@forumone/throughline-core/client#CharacterCountText'
export const CHARACTER_COUNT_TEXTAREA_PATH =
  '@forumone/throughline-core/client#CharacterCountTextarea'

/** The component for this field, or `undefined` when it should be left alone. */
export function counterFor(field: Field): string | undefined {
  if (field.type !== 'text' && field.type !== 'textarea') return undefined
  if (typeof field.maxLength !== 'number' || field.maxLength <= 0) return undefined

  // Already has a control chosen deliberately. Do not overrule it.
  if (field.admin?.components?.Field) return undefined

  if (field.type === 'text') {
    if (field.hasMany) return undefined
    return CHARACTER_COUNT_TEXT_PATH
  }

  return CHARACTER_COUNT_TEXTAREA_PATH
}

function withCounter(field: Field): Field {
  const component = counterFor(field)
  if (!component) return field

  return {
    ...field,
    admin: {
      ...('admin' in field ? field.admin : {}),
      components: {
        ...('admin' in field ? field.admin?.components : {}),
        Field: component,
      },
    },
  } as Field
}

/** Every capped text field in a tree, given the counter. */
export const addCounters = (fields: Field[]): Field[] => mapFields(fields, withCounter)

/**
 * The pass. Covers collections, globals and `config.blocks`, the last being
 * where blocks referenced by slug (a rich-text editor's blocks, say) are
 * registered, which a walk over collections alone would not reach.
 */
export const characterCountPlugin =
  (): Plugin =>
  (config: Config): Config => {
    // Each key is reattached only when it was there to begin with:
    // `exactOptionalPropertyTypes` tells an `undefined` key from a missing one.
    const next: Config = { ...config }

    if (config.blocks) {
      next.blocks = config.blocks.map((block) => ({ ...block, fields: addCounters(block.fields) }))
    }

    if (config.collections) {
      next.collections = config.collections.map((collection) => ({
        ...collection,
        fields: addCounters(collection.fields),
      }))
    }

    if (config.globals) {
      next.globals = config.globals.map((global) => ({
        ...global,
        fields: addCounters(global.fields),
      }))
    }

    return next
  }
