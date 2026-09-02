import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { linkField, toPayloadField, type ContentField, type FieldContext } from './fields'

/*
The generator, asked directly what it produces.

This file had no tests for as long as it existed, and four of its defects
shipped. Every one of them was caught downstream — in `apps/web`, by a suite
asserting the *generated blocks* — which is the right invariant and is staying
where it is. But a suite over the output can only fail on the shapes this one
instance's manifest happens to contain, and only once somebody has already
published the bad output. It cannot answer "what does this do with a required
link inside an optional group", because no contract in that repo has one.

The four:

  - every generated boolean was `defaultValue: false`, so a component's own
    default was unreachable and `VideoEmbed.hasFacade` shipped off — a YouTube
    iframe and its cookies in the server HTML of every page with a video, on a
    site whose rule is that no third-party tracking runs before consent
  - `allOrNothing` read an unticked checkbox as evidence the group had been
    filled in, so `ManagedForm` could not be added to a page at all: "Consent
    is invalid" on a block the editor had not touched (#354)
  - `required` was read for every field type and dropped for `link`, so
    `/work` shipped four `<a>` elements with no `href` (#483)
  - an optional group generated its children literally, so a block carrying an
    optional image could not be published without one — six of the eight
    blocks on the About page

So the assertions below are mostly about the two validations, because those are
where all the behaviour is. The type table is the cheap half, and it exists so
that a tenth `ContentField` type added without a branch fails here rather than
throwing `undefined` into a Payload config at boot.

No Payload instance and no database: a field config is a value, and a `validate`
is a function on it.
*/

/** A context that resolves nothing, which is the common case. */
function context(overrides: Partial<FieldContext> = {}): FieldContext {
  return {
    component: 'Example',
    overrides: {},
    mediaCollection: 'media',
    linkCollections: ['pages'],
    resolveSelectOptions: () => null,
    resolveNamedOptions: () => null,
    ...overrides,
  }
}

/** A contract field with everything optional left off. */
function field(partial: Partial<ContentField> & Pick<ContentField, 'type'>): ContentField {
  return { name: 'example', required: false, ...partial }
}

/** `toPayloadField`, having asserted it produced something. */
function generate(partial: Partial<ContentField> & Pick<ContentField, 'type'>, ctx = context()) {
  const generated = toPayloadField(field(partial), ctx)
  expect(generated, 'the generator dropped the field').not.toBeNull()
  return generated as Field & Record<string, unknown>
}

type ValidateFn = (
  value: unknown,
  options?: { siblingData?: unknown },
) => true | string | Promise<true | string>

const validateOf = (generated: Field): ValidateFn =>
  (generated as unknown as { validate: ValidateFn }).validate

const childNames = (generated: Field): string[] =>
  ((generated as unknown as { fields: Field[] }).fields ?? []).map(child =>
    'name' in child ? child.name : '',
  )

const childNamed = (generated: Field, name: string): Field & Record<string, unknown> =>
  ((generated as unknown as { fields: Field[] }).fields.find(
    child => 'name' in child && child.name === name,
  ) ?? {}) as Field & Record<string, unknown>

/* ------------------------------------------------------------------ */

describe('every contract field type produces a Payload field', () => {
  /*
  The exhaustiveness check, and the reason it lists the types rather than
  iterating them: `ContentField['type']` is a union of ten names, and a
  generator that silently returns `undefined` for an eleventh puts a hole in a
  Payload config that only fails at boot, a long way from the contract that
  caused it.

  `group` and `array` are absent here because both need an `of` and are covered
  in their own sections below.
  */
  it.each([
    // `text` with no cap is a textarea — see the `text` section below for why.
    ['text', 'textarea'],
    ['richtext', 'richText'],
    ['image', 'upload'],
    ['video', 'text'],
    ['boolean', 'checkbox'],
    ['number', 'number'],
    ['link', 'group'],
  ] as const)('%s becomes a %s field', (contractType, payloadType) => {
    expect(generate({ type: contractType }).type).toBe(payloadType)
  })

  it('keeps the contract name as the field name', () => {
    expect(generate({ type: 'text', name: 'heading' }).name).toBe('heading')
  })

  it('carries a constraint through as the description an author reads', () => {
    const generated = generate({ type: 'text', constraints: 'Two lines at most.' })
    expect((generated.admin as { description?: string }).description).toBe('Two lines at most.')
  })
})

describe('text', () => {
  /*
  A 600-character answer in a single-line input is a usability bug rather than a
  styling preference, and Payload makes `text` and `textarea` separate types —
  so the threshold decides which object is built, not a property on one.
  */
  it('stays a single line up to the threshold', () => {
    expect(generate({ type: 'text', maxLength: 160 }).type).toBe('text')
    expect(generate({ type: 'text', maxLength: 160 }).maxLength).toBe(160)
  })

  it('becomes a textarea above it', () => {
    expect(generate({ type: 'text', maxLength: 161 }).type).toBe('textarea')
  })

  /*
  An uncapped field is prose until somebody says otherwise. Reading "no
  maxLength" as "short" would put every body field in the library into a
  single-line input.
  */
  it('is a textarea when the contract sets no cap at all', () => {
    const generated = generate({ type: 'text' })
    expect(generated.type).toBe('textarea')
    expect(generated).not.toHaveProperty('maxLength')
  })

  /*
  A text field whose prop is a union of string literals is a select the
  contract had no way to describe — `ContentField` has ten types and none of
  them means "one of these names". The component's own type says it, so the
  host resolves it; a free-text box there lets an author type a glyph name that
  renders nothing at all.
  */
  it('becomes a select when the host can resolve a literal union for it', () => {
    const generated = generate(
      { type: 'text', name: 'icon' },
      context({ resolveSelectOptions: () => ['arrow', 'download'] }),
    )
    expect(generated.type).toBe('select')
    expect(generated.options).toEqual(['arrow', 'download'])
  })

  it('prefers the union over the length rule, however long the cap', () => {
    const generated = generate(
      { type: 'text', maxLength: 4000 },
      context({ resolveSelectOptions: () => ['a', 'b'] }),
    )
    expect(generated.type).toBe('select')
  })
})

describe('boolean', () => {
  /*
  The defect with teeth, and the reason it is asserted as a pair.

  A React default lives in the signature and applies only to an `undefined`
  prop. Nothing generated ever leaves one that way: a checkbox is stored ticked
  or unticked and never absent, and `coerce` turns whatever is stored into a
  real boolean. So while this branch hardcoded `false`, every boolean in every
  CMS was the opposite of what its component said, unreachably.
  */
  it('starts ticked when the contract says so', () => {
    const generated = generate({ type: 'boolean', defaultValue: true })
    expect(generated.type).toBe('checkbox')
    expect(generated.defaultValue).toBe(true)
  })

  it('starts unticked when the contract says nothing, which keeps the old behaviour', () => {
    expect(generate({ type: 'boolean' }).defaultValue).toBe(false)
  })

  it('always states a boolean default rather than leaving it absent', () => {
    // An absent default is not the same as `false`: Payload stores nothing,
    // `coerce` sees `undefined`, and the value the component gets depends on
    // whether anybody has opened the block.
    for (const declared of [true, false, undefined]) {
      const generated = generate(
        declared === undefined ? { type: 'boolean' } : { type: 'boolean', defaultValue: declared },
      )
      expect(typeof generated.defaultValue).toBe('boolean')
    }
  })

  /*
  `required` on a checkbox means "must be ticked", which is never what a
  contract means by the word — it means the prop is not optional, and a
  boolean prop always has a value.
  */
  it('is never required, whatever the contract says', () => {
    expect(generate({ type: 'boolean', required: true })).not.toHaveProperty('required')
  })
})

describe('image and video', () => {
  it('points an image at the host’s media collection', () => {
    const generated = generate({ type: 'image' }, context({ mediaCollection: 'uploads' }))
    expect(generated.type).toBe('upload')
    expect(generated.relationTo).toBe('uploads')
  })

  /*
  Two kinds of video wear one contract type. A provider embed is a URL the
  reader's browser fetches from YouTube; an uploaded clip is a file this site
  serves. Generating the second as a text field would ask an author to paste a
  path to something they have no way to upload.
  */
  it('makes a provider embed a text field, and says what to paste', () => {
    const generated = generate({ type: 'video' })
    expect(generated.type).toBe('text')
    expect((generated.admin as { description?: string }).description).toMatch(/YouTube|Vimeo/)
  })

  it('makes an uploaded clip an upload against the media collection', () => {
    const generated = generate(
      { type: 'video', name: 'clip' },
      context({ overrides: { Example: { fields: { clip: { as: 'videoUpload' } } } } }),
    )
    expect(generated.type).toBe('upload')
    expect(generated.relationTo).toBe('media')
  })
})

describe('select', () => {
  it('takes its options from the host', () => {
    const generated = generate(
      { type: 'select' },
      context({ resolveSelectOptions: () => ['card', 'panel'] }),
    )
    expect(generated.options).toEqual(['card', 'panel'])
  })

  it('lets an override supply options the host cannot resolve', () => {
    const generated = generate(
      { type: 'select', name: 'tone' },
      context({ overrides: { Example: { fields: { tone: { options: ['light', 'dark'] } } } } }),
    )
    expect(generated.options).toEqual(['light', 'dark'])
  })

  /*
  A select with no options is a field an author cannot fill in. Throwing at
  generation names the component and the path; shipping it produces an empty
  dropdown and no explanation.
  */
  it('throws rather than generating a dropdown with nothing in it', () => {
    expect(() => generate({ type: 'select', name: 'tone' })).toThrow(/tone is a select/)
  })
})

describe('an icon field', () => {
  /*
  The one field whose prop type is a `ReactNode`, so it cannot supply its own
  options. It falls back through three sources, and the fallback order is what
  keeps a component that names its own glyph set from being overridden by the
  global one.
  */
  it('prefers the override’s own options', () => {
    const generated = generate(
      { type: 'text', name: 'icon' },
      context({
        overrides: { Example: { fields: { icon: { as: 'icon', options: ['star'] } } } },
        resolveSelectOptions: () => ['resolved'],
        resolveNamedOptions: () => ['global'],
      }),
    )
    expect(generated.options).toEqual(['star'])
  })

  it('falls back to the component’s own union, then to the global icon set', () => {
    const viaUnion = generate(
      { type: 'text', name: 'icon' },
      context({
        overrides: { Example: { fields: { icon: { as: 'icon' } } } },
        resolveSelectOptions: () => ['resolved'],
        resolveNamedOptions: () => ['global'],
      }),
    )
    expect(viaUnion.options).toEqual(['resolved'])

    const viaGlobal = generate(
      { type: 'text', name: 'icon' },
      context({
        overrides: { Example: { fields: { icon: { as: 'icon' } } } },
        resolveNamedOptions: () => ['global'],
      }),
    )
    expect(viaGlobal.options).toEqual(['global'])
  })

  it('throws when no glyph set can be found anywhere', () => {
    expect(() =>
      generate(
        { type: 'text', name: 'icon' },
        context({ overrides: { Example: { fields: { icon: { as: 'icon' } } } } }),
      ),
    ).toThrow(/IconName/)
  })
})

describe('what the CMS is not offered', () => {
  it('drops an omitted field entirely', () => {
    const ctx = context({ overrides: { Example: { fields: { state: { omit: true } } } } })
    expect(toPayloadField(field({ type: 'text', name: 'state' }), ctx)).toBeNull()
  })

  /*
  A group with no children is a *slot* — a position where a component renders
  another component, declared in `composition.allowedSlots`. It holds no
  authored content, so there is nothing to put in the CMS, and generating an
  empty group would have Payload reject the config.
  */
  it('drops a slot, which is a component position rather than content', () => {
    expect(toPayloadField(field({ type: 'group', name: 'aside' }), context())).toBeNull()
    expect(toPayloadField(field({ type: 'group', name: 'aside', of: [] }), context())).toBeNull()
  })

  it('throws when overrides leave a group with no children at all', () => {
    const ctx = context({
      overrides: { Example: { fields: { 'wrapper.only': { omit: true } } } },
    })
    expect(() =>
      toPayloadField(
        field({ type: 'group', name: 'wrapper', of: [field({ type: 'text', name: 'only' })] }),
        ctx,
      ),
    ).toThrow(/no authorable children/)
  })
})

describe('an array', () => {
  const rows = [field({ type: 'text', name: 'title', maxLength: 80 })]

  it('generates its rows from `of`', () => {
    const generated = generate({ type: 'array', name: 'items', of: rows })
    expect(generated.type).toBe('array')
    expect(childNames(generated)).toEqual(['title'])
  })

  /*
  Payload has no "required array". A minimum of one row is what the contract
  means by it, and `required: true` on an array field means something else
  entirely — that the key is present, which it always is.
  */
  it('expresses required as a minimum of one row', () => {
    expect(generate({ type: 'array', name: 'items', required: true, of: rows }).minRows).toBe(1)
    expect(generate({ type: 'array', name: 'items', of: rows })).not.toHaveProperty('minRows')
  })

  it('throws on an array with no row shape, rather than generating an empty one', () => {
    expect(() => generate({ type: 'array', name: 'items' })).toThrow(/no `of`/)
  })
})

describe('a required group', () => {
  const children = [
    field({ type: 'text', name: 'src', required: true }),
    field({ type: 'text', name: 'alt', required: true }),
  ]

  it('keeps its children required and adds no validation of its own', () => {
    const generated = generate({ type: 'group', name: 'image', required: true, of: children })
    expect(childNamed(generated, 'src').required).toBe(true)
    expect(childNamed(generated, 'alt').required).toBe(true)
    expect(generated).not.toHaveProperty('validate')
  })
})

describe('an optional group', () => {
  /*
  `ProseSection.image` is `required: false` with `src` and `alt` both required
  inside it — "an image is optional, but a *half* image is not". Generated
  literally, Payload validates those children whether or not the group holds
  anything, so every block carrying an optional image became a block that could
  not be published without one.
  */
  const children = [
    field({ type: 'text', name: 'src', required: true }),
    field({ type: 'text', name: 'alt', required: true }),
  ]

  const optionalImage = () => generate({ type: 'group', name: 'image', of: children })

  it('relaxes its children, so the group can be left out', () => {
    const generated = optionalImage()
    expect(childNamed(generated, 'src').required).toBe(false)
    expect(childNamed(generated, 'alt').required).toBe(false)
  })

  it('relaxes a nested group’s children too', () => {
    const generated = generate({
      type: 'group',
      name: 'outer',
      of: [field({ type: 'group', name: 'inner', required: true, of: children })],
    })
    const inner = childNamed(generated, 'inner')
    expect(
      (inner as unknown as { fields: Field[] }).fields.every(
        child => (child as { required?: boolean }).required !== true,
      ),
    ).toBe(true)
  })

  describe('the promise it makes instead: fill it or leave it', () => {
    it('is silent on a group nobody has touched', async () => {
      expect(await validateOf(optionalImage())({})).toBe(true)
      expect(await validateOf(optionalImage())({ src: '', alt: '' })).toBe(true)
      expect(await validateOf(optionalImage())(undefined)).toBe(true)
    })

    it('asks for what is missing once anything is filled in', async () => {
      const refusal = await validateOf(optionalImage())({ src: '/a.jpg' })
      expect(refusal).not.toBe(true)
      expect(String(refusal)).toContain('alt')
    })

    it('names every missing child, not just the first', async () => {
      const generated = generate({
        type: 'group',
        name: 'card',
        of: [
          field({ type: 'text', name: 'title', required: true }),
          field({ type: 'text', name: 'href', required: true }),
          field({ type: 'text', name: 'note' }),
        ],
      })
      const refusal = String(await validateOf(generated)({ note: 'typed something' }))
      expect(refusal).toContain('title')
      expect(refusal).toContain('href')
    })

    it('passes once everything required is there', async () => {
      expect(await validateOf(optionalImage())({ src: '/a.jpg', alt: 'A photo' })).toBe(true)
    })

    /*
    #354, in the shape that reached an editor. `ManagedForm.consent` holds a
    `required` boolean beside a required `text`, and Payload stores a checkbox
    unticked rather than absent — so reading `false` as "somebody filled this
    in" demanded the text of an author who had typed nothing. The block could
    not be added to a page at all: "Consent is invalid", on a block they had
    not touched.
    */
    it('reads an unticked checkbox as untouched, which is the #354 defect', async () => {
      const generated = generate({
        type: 'group',
        name: 'consent',
        of: [
          field({ type: 'boolean', name: 'required' }),
          field({ type: 'text', name: 'text', required: true }),
        ],
      })
      expect(await validateOf(generated)({ required: false, text: '' })).toBe(true)
    })

    /*
    The same defect by the opposite route. A checkbox the contract starts
    *ticked* says "nobody touched this" with `true`, which the value alone
    cannot express — so the rule has to know which field it is looking at.
    */
    it('reads a default-ticked checkbox as untouched too', async () => {
      const generated = generate({
        type: 'group',
        name: 'facade',
        of: [
          field({ type: 'boolean', name: 'enabled', defaultValue: true }),
          field({ type: 'text', name: 'label', required: true }),
        ],
      })
      expect(await validateOf(generated)({ enabled: true, label: '' })).toBe(true)
    })

    /*
    Neither value of a checkbox is evidence, and that asymmetry is deliberate
    rather than an oversight: for a default-ticked box `true` is the stored
    default, and `false` is indistinguishable from an author who ticked it and
    changed their mind about the whole group. Demanding the group's required
    children off a single untick would be #354 again in a smaller shape — an
    error on a block whose author has typed nothing.

    The cost is that a group holding *only* a checkbox can never be "in use",
    so its required siblings are never demanded. No contract has that shape,
    and one that did would be saying the checkbox is the content.
    */
    it('is silent whichever way a lone checkbox is left', async () => {
      const generated = generate({
        type: 'group',
        name: 'facade',
        of: [
          field({ type: 'boolean', name: 'enabled', defaultValue: true }),
          field({ type: 'text', name: 'label', required: true }),
        ],
      })
      for (const enabled of [true, false]) {
        expect(await validateOf(generated)({ enabled, label: '' })).toBe(true)
      }
      // Type into anything that is not a checkbox and the group is in use.
      expect(await validateOf(generated)({ enabled: false, label: '', note: 'x' })).not.toBe(true)
    })

    /*
    A group holding a link is never literally empty: `linkField` defaults
    `mode` to `'internal'`, so an untouched one arrives as `{ mode: 'internal' }`.
    Compared shallowly that is a filled group, and the rule then fires on
    exactly the case it exists to allow.
    */
    it('does not count a link’s default mode as somebody having been there', async () => {
      const generated = generate({
        type: 'group',
        name: 'caseStudy',
        of: [
          field({ type: 'text', name: 'title', required: true }),
          field({ type: 'link', name: 'href' }),
        ],
      })
      expect(await validateOf(generated)({ title: '', href: { mode: 'internal' } })).toBe(true)
    })

    it('has nothing to demand when no child is required', async () => {
      const generated = generate({
        type: 'group',
        name: 'meta',
        of: [field({ type: 'text', name: 'note' })],
      })
      expect(await validateOf(generated)({ note: 'anything' })).toBe(true)
    })
  })
})

describe('a link', () => {
  it('offers the three modes, defaulting to a page on this site', () => {
    const generated = linkField('href', context())
    expect(childNames(generated)).toEqual(['mode', 'reference', 'url', 'anchor', 'newTab'])
    expect(childNamed(generated, 'mode').defaultValue).toBe('internal')
  })

  /*
  An internal link holds a relationship rather than a path, so renaming a page
  cannot break every link that pointed at it — the renderer resolves the
  current slug at read time.
  */
  it('holds a relationship for an internal link, against the host’s collections', () => {
    const generated = linkField('href', context({ linkCollections: ['pages', 'posts'] }))
    const reference = childNamed(generated, 'reference')
    expect(reference.type).toBe('relationship')
    expect(reference.relationTo).toEqual(['pages', 'posts'])
  })

  it('shows each destination field only for the mode that uses it', () => {
    const generated = linkField('href', context())
    const conditionOf = (name: string) =>
      (childNamed(generated, name).admin as { condition: (d: unknown, s: unknown) => boolean })
        .condition

    expect(conditionOf('reference')({}, { mode: 'internal' })).toBe(true)
    expect(conditionOf('reference')({}, { mode: 'external' })).toBe(false)
    expect(conditionOf('url')({}, { mode: 'external' })).toBe(true)
    expect(conditionOf('anchor')({}, { mode: 'anchor' })).toBe(true)
    expect(conditionOf('newTab')({}, { mode: 'internal' })).toBe(false)
  })

  describe('when the contract marks it required', () => {
    /*
    #483. `required: true` on a contract link bought nothing: the flag was read
    for every other field type and dropped for this one. Payload's own
    `required` could not have replaced it either — on a group it asserts only
    that the object exists, which it always does, and on the children it would
    demand a `url` of a link whose author chose the internal mode.

    `FeaturedWork` marks each item's `href` required and types it `string`. Two
    items on `/work` were saved with the link untouched, `resolveHref` returned
    `undefined`, React dropped the attribute, and the page shipped four `<a>`
    elements with no `href` — skipped by crawlers, unreachable by keyboard, and
    scoring 0 on Lighthouse's `crawlable-anchors`.
    */
    const required = () => linkField('href', context(), undefined, true)

    /** A row somebody has plainly been typing into. */
    const filledIn = { title: 'A case study', body: 'What changed, and for whom.' }

    it('generates a validate at all, which is the whole of #483', () => {
      expect(typeof validateOf(required())).toBe('function')
      expect(linkField('href', context())).not.toHaveProperty('validate')
    })

    it('refuses a filled-in row whose link goes nowhere', async () => {
      const refusal = await validateOf(required())({ mode: 'internal' }, { siblingData: filledIn })
      expect(refusal).not.toBe(true)
      expect(String(refusal)).toMatch(/Choose the page/)
    })

    it('accepts each mode once it has a destination', async () => {
      for (const value of [
        { mode: 'internal', reference: { relationTo: 'pages', value: 'an-id' } },
        { mode: 'external', url: 'https://example.org' },
        { mode: 'anchor', anchor: 'a-section' },
      ]) {
        expect(await validateOf(required())(value, { siblingData: filledIn })).toBe(true)
      }
    })

    it('asks for the destination the author’s own mode needs', async () => {
      expect(
        String(await validateOf(required())({ mode: 'external' }, { siblingData: filledIn })),
      ).toMatch(/URL/)
      expect(
        String(await validateOf(required())({ mode: 'anchor' }, { siblingData: filledIn })),
      ).toMatch(/id/)
    })

    /*
    The other half of the bargain, and the one that keeps this from becoming
    #354 again: a block or an array row Payload has only just created holds
    defaults, and refusing to save one before anybody has typed into it is an
    error the editor cannot act on.
    */
    it('stays silent on a row nobody has typed into', async () => {
      expect(await validateOf(required())({ mode: 'internal' }, { siblingData: {} })).toBe(true)
      expect(await validateOf(required())({}, { siblingData: { title: '' } })).toBe(true)
      expect(await validateOf(required())({}, {})).toBe(true)
    })

    it('treats an untouched sibling link as no evidence either', async () => {
      // A row whose only other field is itself a link would otherwise look
      // filled in, because `mode` is always present.
      expect(
        await validateOf(required())(
          { mode: 'internal' },
          { siblingData: { other: { mode: 'internal' } } },
        ),
      ).toBe(true)
    })

    it('treats an unticked checkbox sibling as no evidence', async () => {
      expect(
        await validateOf(required())({ mode: 'internal' }, { siblingData: { isFeatured: false } }),
      ).toBe(true)
    })
  })
})
