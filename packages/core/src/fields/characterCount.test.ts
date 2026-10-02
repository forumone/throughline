import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { addCounters, counterFor } from './characterCount.js'

/*
Which fields get a counter is the whole decision here, and every wrong answer is
invisible in review: a field that should have one silently keeps the old
fail-at-save behaviour, and a field that should not have one loses whatever
purpose-built control it had.

`plugin-seo`'s meta fields are the real case for the second: they carry a
`maxLength` *and* their own component with its own counter.
*/

const at = (fields: Field[], path: string[]): Field | undefined => {
  let current: Field[] | undefined = fields
  let found: Field | undefined

  for (const name of path) {
    found = current?.find((f) => 'name' in f && f.name === name)
    current = found && 'fields' in found ? found.fields : undefined
  }

  return found
}

const componentOf = (field: Field | undefined): unknown =>
  field && 'admin' in field ? field.admin?.components?.Field : undefined

describe('counterFor', () => {
  it('claims a capped text field', () => {
    expect(counterFor({ name: 'title', type: 'text', maxLength: 160 })).toContain(
      'CharacterCountText',
    )
  })

  it('claims a capped textarea, with the textarea control', () => {
    expect(counterFor({ name: 'intro', type: 'textarea', maxLength: 400 })).toContain(
      'CharacterCountTextarea',
    )
  })

  it('leaves a text field with no cap alone', () => {
    // Nothing to count towards; a counter with no denominator is noise.
    expect(counterFor({ name: 'slug', type: 'text' })).toBeUndefined()
  })

  it('leaves a field that already has a component alone', () => {
    const withComponent: Field = {
      name: 'icon',
      type: 'text',
      maxLength: 60,
      admin: { components: { Field: '/blocks/IconSelectField#IconSelectField' } },
    }
    expect(counterFor(withComponent)).toBeUndefined()
  })

  it('recognises a component given in the object form plugins use', () => {
    /*
    `plugin-seo` does not hand Payload a bare string — it registers
    `{ path, clientProps }` so it can pass `hasGenerateTitleFn`. A truthiness
    check covers both; a `typeof === 'string'` check would have overwritten
    every meta field in the build.

    Those two happen to carry no `maxLength` today, so nothing currently
    depends on this. It is checked because the next plugin might.
    */
    const objectForm: Field = {
      name: 'title',
      type: 'text',
      maxLength: 60,
      admin: {
        components: {
          Field: {
            path: '@payloadcms/plugin-seo/client#MetaTitleComponent',
            clientProps: { hasGenerateTitleFn: true },
          },
        },
      },
    }
    expect(counterFor(objectForm)).toBeUndefined()
  })

  it('leaves hasMany text alone', () => {
    // Rendered as a multi-value select, so this control is the wrong shape.
    expect(counterFor({ name: 'tags', type: 'text', hasMany: true, maxLength: 40 })).toBeUndefined()
  })

  it('leaves other field types alone even when they look capped', () => {
    expect(counterFor({ name: 'body', type: 'richText' })).toBeUndefined()
    expect(counterFor({ name: 'count', type: 'number', max: 10 })).toBeUndefined()
  })

  it('ignores a zero or negative cap rather than dividing by it', () => {
    expect(counterFor({ name: 'x', type: 'text', maxLength: 0 })).toBeUndefined()
  })
})

describe('addCounters', () => {
  it('reaches a field nested in tabs, a block and an array', () => {
    // The real depth: Posts puts `layout` behind a tab, blocks inside it, and
    // several blocks carry arrays of capped rows.
    const fields: Field[] = [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Content',
            fields: [
              {
                name: 'layout',
                type: 'blocks',
                blocks: [
                  {
                    slug: 'KeyPoints',
                    fields: [
                      {
                        name: 'points',
                        type: 'array',
                        fields: [{ name: 'point', type: 'text', maxLength: 90 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]

    const mapped = addCounters(fields)
    const tabs = mapped[0]
    if (!tabs || tabs.type !== 'tabs') throw new Error('expected tabs')

    const layout = tabs.tabs[0]?.fields[0]
    if (!layout || layout.type !== 'blocks') throw new Error('expected blocks')

    const block = layout.blocks[0]
    if (!block || typeof block === 'string') throw new Error('expected a block config')

    expect(componentOf(at(block.fields, ['points', 'point']))).toContain('CharacterCountText')
  })

  it('does not disturb a field it does not claim', () => {
    const original: Field[] = [{ name: 'slug', type: 'text', required: true }]
    expect(addCounters(original)[0]).toEqual(original[0])
  })
})
