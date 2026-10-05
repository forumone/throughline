import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ContentField } from '../generate/fields.js'
import type { CoerceContext, MediaLike } from './coerce.js'
import { missingRequiredImages } from './incomplete.js'
import { RenderBlocks } from './RenderBlocks.js'

/*
One card with no image took a whole landing page down in Live Preview: the
component read `item.image.src` from a row whose image was empty, and threw.
forumone-2026#840. A block like that is handed to the host instead.
*/

const featuredWork: ContentField[] = [
  { name: 'heading', type: 'text', required: false },
  {
    name: 'items',
    type: 'array',
    required: true,
    of: [
      { name: 'title', type: 'text', required: true },
      {
        name: 'image',
        type: 'group',
        required: true,
        of: [
          { name: 'src', type: 'image', required: true },
          { name: 'alt', type: 'text', required: false },
        ],
      },
    ],
  },
  { name: 'decoration', type: 'image', required: false },
]

const media: Record<number, MediaLike> = { 4: { url: '/media/4.jpg', alt: 'A photo' } }

const context: CoerceContext = {
  overrides: {},
  resolveMedia: (value: unknown) => (typeof value === 'number' ? (media[value] ?? null) : null),
  resolveHref: () => undefined,
  renderRichText: () => null,
  renderIcon: () => null,
}

describe('missingRequiredImages', () => {
  it('names a row whose required image is empty, or gone', () => {
    const props = {
      items: [
        { title: 'One', image: { src: '/media/4.jpg' } },
        { title: 'Two', image: { alt: 'kept' } },
        { title: 'Three' },
      ],
    }
    expect(missingRequiredImages('FeaturedWork', featuredWork, props, {})).toEqual([
      'items[1].image.src',
      'items[2].image',
    ])
  })

  it('ignores an optional image, and an image the site does not offer', () => {
    expect(missingRequiredImages('FeaturedWork', featuredWork, { items: [] }, {})).toEqual([])
    expect(
      missingRequiredImages(
        'Hero',
        [{ name: 'image', type: 'image', required: true }],
        {},
        { Hero: { fields: { image: { omit: true } } } },
      ),
    ).toEqual([])
  })
})

function rendered(
  blocks: Record<string, unknown>[],
  onIncompleteBlock?: Parameters<typeof RenderBlocks>[0]['onIncompleteBlock'],
): ReactElement[] {
  const Throws = (props: Record<string, unknown>) => {
    const items = props['items'] as { image: { src: string } }[]
    return (
      <ul>
        {items.map((item) => (
          <li key={item.image.src}>{item.image.src}</li>
        ))}
      </ul>
    )
  }
  const tree = RenderBlocks({
    blocks: blocks as never,
    registry: { FeaturedWork: Throws },
    fields: { FeaturedWork: featuredWork },
    context,
    ...(onIncompleteBlock ? { onIncompleteBlock } : {}),
  })
  const children = (tree?.props as { children: ReactNode[] }).children
  return children.filter(isValidElement) as ReactElement[]
}

describe('RenderBlocks', () => {
  const finished = {
    blockType: 'FeaturedWork',
    id: 'a',
    items: [{ title: 'One', image: { src: 4 } }],
  }
  const unfinished = {
    blockType: 'FeaturedWork',
    id: 'b',
    items: [
      { title: 'One', image: { src: 4 } },
      { title: 'Two', image: { src: null } },
    ],
  }

  it('renders a finished block as its component', () => {
    const [only] = rendered([finished])
    expect((only?.props as { items: unknown[] }).items).toHaveLength(1)
  })

  it('hands an unfinished one to the host rather than to a component that would throw', () => {
    const seen: string[][] = []
    const [, second] = rendered([finished, unfinished], ({ missing }) => {
      seen.push(missing)
      return <p>Unfinished</p>
    })
    expect(seen).toEqual([['items[1].image']])
    expect((second?.props as { children: ReactElement }).children).toEqual(<p>Unfinished</p>)
  })

  it('renders nothing for it when the host says nothing', () => {
    const [, second] = rendered([finished, unfinished])
    expect((second?.props as { children: unknown }).children).toBeNull()
  })
})
