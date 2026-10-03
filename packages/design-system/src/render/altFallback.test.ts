import { describe, expect, it } from 'vitest'
import type { ContentField } from '../generate/fields.js'
import { coerceBlock, type CoerceContext, type MediaLike } from './coerce.js'

const ctx: CoerceContext = {
  overrides: {},
  resolveMedia: value => (value && typeof value === 'object' ? (value as MediaLike) : null),
  resolveHref: () => undefined,
  renderRichText: () => null,
  renderIcon: () => null,
}

const photo = { url: '/photo.jpg', alt: 'Two researchers reviewing a dashboard' }

const text = (name: string): ContentField => ({ name, type: 'text', required: false })
const image = (name: string): ContentField => ({ name, type: 'image', required: false })

describe('alt text beside an image', () => {
  it("falls back to the media's alt when the block's is empty", () => {
    const fields = [image('image'), text('imageAlt')]
    expect(coerceBlock('Card', fields, { image: photo, imageAlt: '' }, ctx)).toMatchObject({
      image: '/photo.jpg',
      imageAlt: photo.alt,
    })
    expect(coerceBlock('Card', fields, { image: photo }, ctx).imageAlt).toBe(photo.alt)
    expect(coerceBlock('Card', fields, { image: photo, imageAlt: '  ' }, ctx).imageAlt).toBe(
      photo.alt,
    )
  })

  it("keeps the block's own alt when one is given", () => {
    const fields = [image('image'), text('imageAlt')]
    expect(
      coerceBlock('Card', fields, { image: photo, imageAlt: 'The Q3 dashboard' }, ctx).imageAlt,
    ).toBe('The Q3 dashboard')
  })

  it('falls back whichever order the two fields are declared in', () => {
    const fields = [text('imageAlt'), image('image')]
    expect(coerceBlock('Card', fields, { image: photo, imageAlt: '' }, ctx).imageAlt).toBe(
      photo.alt,
    )
  })

  it('pairs `src` with `alt` inside a group and in array rows', () => {
    const ref: ContentField = {
      name: 'image',
      type: 'group',
      required: false,
      of: [image('src'), text('alt')],
    }
    const items: ContentField = {
      name: 'items',
      type: 'array',
      required: false,
      of: [image('image'), text('imageAlt'), text('quote')],
    }
    const props = coerceBlock(
      'Quotes',
      [ref, items],
      { image: { src: photo, alt: '' }, items: [{ image: photo, quote: 'Hello' }] },
      ctx,
    )
    expect(props.image).toEqual({ src: '/photo.jpg', alt: photo.alt })
    expect(props.items).toEqual([{ image: '/photo.jpg', imageAlt: photo.alt, quote: 'Hello' }])
  })

  it('does not hand an alt prop to a component that declares none', () => {
    expect(coerceBlock('Banner', [image('image')], { image: photo }, ctx)).toEqual({
      image: '/photo.jpg',
    })
  })

  it('leaves the alt unset when the media has none either', () => {
    const fields = [image('image'), text('imageAlt')]
    const props = coerceBlock('Card', fields, { image: { url: '/photo.jpg' }, imageAlt: '' }, ctx)
    expect(props.imageAlt).toBe('')
  })
})
