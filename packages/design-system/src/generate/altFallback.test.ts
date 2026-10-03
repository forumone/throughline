import { describe, expect, it } from 'vitest'
import { ALT_FALLBACK_NOTE } from '../altText.js'
import { toPayloadField, type ContentField, type FieldContext } from './fields.js'

const ctx: FieldContext = {
  component: 'ProseSection',
  overrides: {},
  mediaCollection: 'media',
  linkCollections: ['pages'],
  resolveSelectOptions: () => null,
  resolveNamedOptions: () => null,
}

const imageRef = (required: boolean): ContentField => ({
  name: 'image',
  type: 'group',
  required,
  of: [
    { name: 'src', type: 'image', required: true },
    { name: 'alt', type: 'text', required: true, maxLength: 200 },
  ],
})

type Generated = {
  fields: { name: string; required?: boolean; admin?: { description?: string } }[]
  validate?: (value: unknown) => true | string
}

describe('an alt field beside an image', () => {
  it('is optional, and says it falls back to the media library', () => {
    const group = toPayloadField(imageRef(true), ctx) as unknown as Generated
    const alt = group.fields.find(field => field.name === 'alt')
    expect(alt?.required).toBeUndefined()
    expect(alt?.admin?.description).toBe(ALT_FALLBACK_NOTE)
    expect(group.fields.find(field => field.name === 'src')?.required).toBe(true)
  })

  it('is not demanded once the rest of an optional group is filled in', () => {
    const group = toPayloadField(imageRef(false), ctx) as unknown as Generated
    expect(group.validate?.({ src: 1, alt: '' })).toBe(true)
  })

  it('leaves a text field that pairs with no image alone', () => {
    const group = toPayloadField(
      {
        name: 'caption',
        type: 'group',
        required: true,
        of: [{ name: 'alt', type: 'text', required: true }],
      },
      ctx,
    ) as unknown as Generated
    expect(group.fields[0]?.required).toBe(true)
  })
})
