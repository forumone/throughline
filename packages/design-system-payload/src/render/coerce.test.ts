import { describe, expect, it, vi } from 'vitest'
import type { ContentField } from '../generate/fields'
import { coerceBlock, type CoerceContext, type MediaLike } from './coerce'

/*
The other half of the round trip: what Payload stored, back into the props a
component takes.

`generate/fields.ts` decides what the CMS offers; this decides what reaches
React. The two are driven by the same `ContentField[]`, which is what stops
them describing different shapes — but "driven by the same table" is not the
same as "agree", and the interesting failures here are all cases where they
did not.

None of these throws. An image whose media cannot be resolved, a group that
looks filled because a checkbox is storing its default, an array of strings
mapped to an array of objects — every one of them renders. They render
*wrong*, in a way a type cannot see, because both sides of the seam are
`unknown` by the time they meet.

No Payload instance and no database. `resolveMedia`, `resolveHref`,
`renderRichText` and `renderIcon` are the four things the host supplies, and
they are stubs here — which is honest rather than lazy: what they return is the
host's business, and what this module does with what they return is not.
*/

/** A context whose resolvers are the simplest thing that could work. */
function context(overrides: Partial<CoerceContext> = {}): CoerceContext {
  return {
    overrides: {},
    resolveMedia: (value: unknown) => (value as MediaLike | null) ?? null,
    resolveHref: link => (link?.url as string | undefined) ?? undefined,
    renderRichText: value => `rendered:${String(value)}`,
    renderIcon: name => `icon:${name}`,
    ...overrides,
  }
}

function field(partial: Partial<ContentField> & Pick<ContentField, 'type'>): ContentField {
  return { name: 'example', required: false, ...partial }
}

const coerce = (
  fields: ContentField[],
  data: Record<string, unknown>,
  ctx: CoerceContext = context(),
) => coerceBlock('Example', fields, data, ctx)

/* ------------------------------------------------------------------ */

describe('the values that pass straight through', () => {
  it.each(['text', 'select', 'video', 'number'] as const)('%s arrives as itself', type => {
    expect(coerce([field({ type, name: 'value' })], { value: 'kept' })).toEqual({ value: 'kept' })
  })

  it('renders rich text through the host', () => {
    const renderRichText = vi.fn(() => 'the body')
    const props = coerce(
      [field({ type: 'richtext', name: 'body' })],
      { body: { root: {} } },
      context({ renderRichText }),
    )
    expect(props.body).toBe('the body')
    expect(renderRichText).toHaveBeenCalledWith({ root: {} })
  })

  /*
  A checkbox arrives from Postgres as a boolean, but a JSONB column round-trips
  whatever was written and an import can put a string in one. `Boolean('false')`
  is `true`, which is the wrong answer — but so is passing the string on to a
  component whose prop is typed `boolean`, and this at least fails visibly.
  */
  it('makes a boolean a real boolean', () => {
    expect(coerce([field({ type: 'boolean', name: 'on' })], { on: 1 })).toEqual({ on: true })
    expect(coerce([field({ type: 'boolean', name: 'on' })], { on: false })).toEqual({ on: false })
  })
})

describe('a key with nothing in it is absent, not undefined', () => {
  /*
  `exactOptionalPropertyTypes` is on across the design system, so
  `{ heading: undefined }` is not assignable to `{ heading?: string }`. There
  are several hundred optional props; every one of them has to be missing
  rather than explicitly undefined.
  */
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('drops a %s value entirely', (_name, value) => {
    const props = coerce([field({ type: 'text', name: 'heading' })], { heading: value })
    expect(props).not.toHaveProperty('heading')
    expect(Object.keys(props)).toEqual([])
  })

  it('drops a field the block has no value for at all', () => {
    expect(coerce([field({ type: 'text', name: 'heading' })], {})).toEqual({})
  })

  /*
  An empty string is a value: an author who cleared a field said something, and
  a component distinguishing `''` from absent is entitled to.
  */
  it('keeps an empty string, which an author typed', () => {
    expect(coerce([field({ type: 'text', name: 'heading' })], { heading: '' })).toEqual({
      heading: '',
    })
  })
})

describe('an image becomes up to three props', () => {
  const media: MediaLike = {
    url: '/photo.webp',
    srcSet: '/photo-400.webp 400w, /photo-800.webp 800w',
    sizes: '(max-width: 640px) 100vw, 50vw',
  }

  /*
  A `srcset` is not content an author writes — it is what an optimizer
  computed — so it is not a field in any contract and must not become one. The
  CMS offers `src` and `alt`; the host returns the rest; this is the one place
  that knows where they go.
  */
  it('names the siblings after the image prop', () => {
    const props = coerce(
      [field({ type: 'image', name: 'image' })],
      { image: media },
      context({ resolveMedia: () => media }),
    )
    expect(props).toEqual({
      image: '/photo.webp',
      imageSrcSet: media.srcSet,
      imageSizes: media.sizes,
    })
  })

  /*
  Inside an `ImageRef` group or array row the image prop is already called
  `src`, and its siblings are the bare `srcSet` and `sizes` of the HTML
  attributes rather than `srcSrcSet`.
  */
  it('uses the bare attribute names when the prop is already `src`', () => {
    const props = coerce(
      [field({ type: 'group', name: 'photo', of: [field({ type: 'image', name: 'src' })] })],
      { photo: { src: media } },
      context({ resolveMedia: () => media }),
    )
    expect(props.photo).toEqual({
      src: '/photo.webp',
      srcSet: media.srcSet,
      sizes: media.sizes,
    })
  })

  it('omits the responsive siblings the host did not supply', () => {
    const props = coerce(
      [field({ type: 'image', name: 'image' })],
      { image: { url: '/photo.webp' } },
      context({ resolveMedia: () => ({ url: '/photo.webp' }) }),
    )
    expect(props).toEqual({ image: '/photo.webp' })
  })

  /*
  A media id the host cannot resolve — deleted, or unreadable to an anonymous
  request — must drop the prop rather than pass a broken URL. A component
  guarding on `{image && <img src={image} />}` then renders nothing, which is
  the honest outcome.
  */
  it('drops the prop when the media cannot be resolved', () => {
    const props = coerce(
      [field({ type: 'image', name: 'image' })],
      { image: 7 },
      context({ resolveMedia: () => null }),
    )
    expect(props).not.toHaveProperty('image')
  })

  it('drops the prop for a media document with no url', () => {
    const props = coerce(
      [field({ type: 'image', name: 'image' })],
      { image: 7 },
      context({ resolveMedia: () => ({ alt: 'no file' }) }),
    )
    expect(props).not.toHaveProperty('image')
  })

  it('tells the host which component and field the image is for', () => {
    const resolveMedia = vi.fn(() => media)
    coerce(
      [field({ type: 'group', name: 'hero', of: [field({ type: 'image', name: 'src' })] })],
      { hero: { src: 7 } },
      context({ resolveMedia }),
    )
    // A card and a full-bleed hero hold the same shape and want very different
    // numbers of pixels, and the value alone cannot say which this is.
    expect(resolveMedia).toHaveBeenCalledWith(7, { component: 'Example', path: 'hero.src' })
  })
})

describe('an uploaded video is one prop, never three', () => {
  /*
  A `srcset` picks between candidate widths of the same picture, and there are
  no candidate widths of a video file — the browser cannot re-encode one.
  Emitting `clipSrcSet` would put a prop on the component that no component
  takes, and React would pass it to the DOM.
  */
  it('resolves the url and emits no responsive siblings', () => {
    const props = coerce(
      [field({ type: 'video', name: 'clip' })],
      { clip: 9 },
      context({
        overrides: { Example: { fields: { clip: { as: 'videoUpload' } } } },
        resolveMedia: () => ({ url: '/clip.mp4', srcSet: 'should not be used', sizes: '100vw' }),
      }),
    )
    expect(props).toEqual({ clip: '/clip.mp4' })
  })

  it('leaves a provider embed URL alone', () => {
    const props = coerce([field({ type: 'video', name: 'url' })], {
      url: 'https://youtube.com/watch?v=x',
    })
    expect(props).toEqual({ url: 'https://youtube.com/watch?v=x' })
  })
})

describe('a link becomes an href', () => {
  it('asks the host to resolve it', () => {
    const resolveHref = vi.fn(() => '/about')
    const props = coerce(
      [field({ type: 'link', name: 'href' })],
      { href: { mode: 'internal', reference: { relationTo: 'pages', value: 1 } } },
      context({ resolveHref }),
    )
    expect(props).toEqual({ href: '/about' })
    expect(resolveHref).toHaveBeenCalledWith({
      mode: 'internal',
      reference: { relationTo: 'pages', value: 1 },
    })
  })

  it('drops the prop when the link goes nowhere', () => {
    const props = coerce(
      [field({ type: 'link', name: 'href' })],
      { href: { mode: 'internal' } },
      context({ resolveHref: () => undefined }),
    )
    expect(props).not.toHaveProperty('href')
  })
})

describe('an array', () => {
  /*
  A contract saying `tags: string[]` is expressed in the manifest as an array
  whose `of` is a single `text` child, because Payload has no bare
  array-of-strings field and a row needs a column to live in. Mapping every row
  to an object regardless turns `['AI']` into `[{ tag: 'AI' }]`, which
  type-checks nowhere and renders as `[object Object]`.
  */
  it('gives back an array of scalars for a single-column row', () => {
    const props = coerce([field({ type: 'array', name: 'tags', of: [field({ type: 'text', name: 'tag' })] })], {
      tags: [{ tag: 'AI', id: 'row-1' }, { tag: 'Design', id: 'row-2' }],
    })
    expect(props).toEqual({ tags: ['AI', 'Design'] })
  })

  it('keeps numbers as numbers rather than stringifying them', () => {
    const props = coerce(
      [field({ type: 'array', name: 'speeds', of: [field({ type: 'number', name: 'speed' })] })],
      { speeds: [{ speed: 1 }, { speed: 1.5 }] },
    )
    expect(props).toEqual({ speeds: [1, 1.5] })
  })

  it('drops a scalar row that is empty rather than leaving a hole in the list', () => {
    const props = coerce(
      [field({ type: 'array', name: 'tags', of: [field({ type: 'text', name: 'tag' })] })],
      { tags: [{ tag: 'AI' }, {}, { tag: 'Design' }] },
    )
    expect(props).toEqual({ tags: ['AI', 'Design'] })
  })

  it('gives back objects for a multi-column row', () => {
    const props = coerce(
      [
        field({
          type: 'array',
          name: 'items',
          of: [field({ type: 'text', name: 'title' }), field({ type: 'text', name: 'body' })],
        }),
      ],
      { items: [{ title: 'One', body: 'First', id: 'row-1' }] },
    )
    expect(props).toEqual({ items: [{ title: 'One', body: 'First' }] })
  })

  /*
  `id` is Payload's row key. No component has such a prop, so React would pass
  it straight through to the DOM — a stray `id` on whatever element the row
  renders, duplicated across every row on the page.
  */
  it('never carries Payload’s row id into the props', () => {
    const props = coerce(
      [
        field({
          type: 'array',
          name: 'items',
          of: [field({ type: 'text', name: 'title' }), field({ type: 'text', name: 'body' })],
        }),
      ],
      { items: [{ title: 'One', body: 'First', id: 'row-1' }] },
    )
    expect((props.items as Record<string, unknown>[])[0]).not.toHaveProperty('id')
  })

  it('drops the prop for a value that is not a list', () => {
    const of = [field({ type: 'text', name: 'tag' })]
    expect(coerce([field({ type: 'array', name: 'tags', of })], { tags: 'AI' })).not.toHaveProperty(
      'tags',
    )
  })

  it('gives back an empty list for an array nobody added a row to', () => {
    const of = [field({ type: 'text', name: 'tag' })]
    expect(coerce([field({ type: 'array', name: 'tags', of })], { tags: [] })).toEqual({ tags: [] })
  })
})

describe('a group', () => {
  const of = [field({ type: 'text', name: 'title' }), field({ type: 'text', name: 'body' })]

  it('becomes an object of its children’s props', () => {
    const props = coerce([field({ type: 'group', name: 'card', of })], {
      card: { title: 'One', body: 'First' },
    })
    expect(props).toEqual({ card: { title: 'One', body: 'First' } })
  })

  it('is absent for a slot, which holds no authored content', () => {
    expect(coerce([field({ type: 'group', name: 'aside' })], { aside: {} })).toEqual({})
  })

  /*
  The failure this branch exists for. Payload stores an untouched optional
  group as an object either way — `ChallengeOverview.caseStudy` comes back as
  `{ stat: {}, href: { mode: 'internal' } }` because `linkField` defaults
  `mode`. Passed through, that is truthy, and a component guarding with
  `{caseStudy && <RelatedCard … />}` renders a card with no title: an empty
  `<h3>` in the page, which is an axe violation and a heading a screen reader
  announces as nothing.
  */
  it('is absent when nobody filled it in', () => {
    expect(coerce([field({ type: 'group', name: 'card', of })], { card: {} })).toEqual({})
    expect(
      coerce([field({ type: 'group', name: 'card', of })], { card: { title: '', body: null } }),
    ).toEqual({})
  })

  it('is absent when a link’s default mode is the only thing in it', () => {
    const withLink = [field({ type: 'text', name: 'title' }), field({ type: 'link', name: 'href' })]
    expect(
      coerce([field({ type: 'group', name: 'card', of: withLink })], {
        card: { title: '', href: { mode: 'internal' } },
      }),
    ).toEqual({})
  })

  /*
  The same question, asked of an unticked checkbox — and for a while the two
  sides of this seam answered it differently.

  `generate/fields.ts` treats `false` as "nobody touched this", because Payload
  stores a checkbox's default and an author's deliberate untick identically, so
  a group holding one could always be saved. This module did not, so the same
  group was then handed to the component as a truthy object of empty values —
  the exact shape the note above describes, arriving by the one route the note
  did not cover.

  `ManagedForm.consent` is a live instance: an optional group whose `required`
  boolean is stored `false` on every block nobody has configured.
  */
  it('is absent when an unticked checkbox is the only thing in it', () => {
    const withFlag = [
      field({ type: 'boolean', name: 'required' }),
      field({ type: 'text', name: 'text' }),
    ]
    expect(
      coerce([field({ type: 'group', name: 'consent', of: withFlag })], {
        consent: { required: false, text: '' },
      }),
    ).toEqual({})
  })

  it('is present as soon as anything beside the checkbox is filled in', () => {
    const withFlag = [
      field({ type: 'boolean', name: 'required' }),
      field({ type: 'text', name: 'text' }),
    ]
    expect(
      coerce([field({ type: 'group', name: 'consent', of: withFlag })], {
        consent: { required: false, text: 'I agree to…' },
      }),
    ).toEqual({ consent: { required: false, text: 'I agree to…' } })
  })

  it('is present when the checkbox is ticked, which is a choice somebody made', () => {
    const withFlag = [
      field({ type: 'boolean', name: 'required' }),
      field({ type: 'text', name: 'text' }),
    ]
    expect(
      coerce([field({ type: 'group', name: 'consent', of: withFlag })], {
        consent: { required: true, text: '' },
      }),
    ).toEqual({ consent: { required: true, text: '' } })
  })
})

describe('overrides', () => {
  it('drops an omitted field, so runtime state never reaches the props', () => {
    const props = coerce(
      [field({ type: 'text', name: 'state' })],
      { state: 'open' },
      context({ overrides: { Example: { fields: { state: { omit: true } } } } }),
    )
    expect(props).toEqual({})
  })

  /*
  The one name mismatch in the system — `ArticleBody`'s `body` field is the
  component's `children` prop — declared in the overrides so the generator and
  this agree by construction rather than by memory.
  */
  it('renames a field to the prop the component actually takes', () => {
    const props = coerce(
      [field({ type: 'richtext', name: 'body' })],
      { body: { root: {} } },
      context({
        overrides: { Example: { fields: { body: { propName: 'children' } } } },
        renderRichText: () => 'the body',
      }),
    )
    expect(props).toEqual({ children: 'the body' })
  })

  it('renders an icon name as a glyph', () => {
    const renderIcon = vi.fn(() => 'the glyph')
    const props = coerce(
      [field({ type: 'text', name: 'icon' })],
      { icon: 'arrow' },
      context({ overrides: { Example: { fields: { icon: { as: 'icon' } } } }, renderIcon }),
    )
    expect(props).toEqual({ icon: 'the glyph' })
    expect(renderIcon).toHaveBeenCalledWith('arrow')
  })

  it('applies an override to a field nested in a group and in an array row', () => {
    const props = coerce(
      [
        field({
          type: 'array',
          name: 'items',
          of: [field({ type: 'text', name: 'icon' }), field({ type: 'text', name: 'label' })],
        }),
      ],
      { items: [{ icon: 'arrow', label: 'Go' }] },
      context({ overrides: { Example: { fields: { 'items.icon': { as: 'icon' } } } } }),
    )
    expect(props).toEqual({ items: [{ icon: 'icon:arrow', label: 'Go' }] })
  })
})
