import type { CollectionSlug, Field } from 'payload'
import { fieldOverride, type Overrides } from '../overrides'

/**
 * One field of a component's content model, as the manifest describes it.
 * Restated rather than imported from `@forumone/throughline-design-contract`
 * because that package exports the Zod-inferred shape, and this only needs the
 * parts the generator reads.
 */
export interface ContentField {
  name: string
  type:
    | 'text'
    | 'richtext'
    | 'link'
    | 'image'
    | 'video'
    | 'select'
    | 'group'
    | 'array'
    | 'boolean'
    | 'number'
  required: boolean
  maxLength?: number
  /** `boolean` only — see the contract schema. */
  defaultValue?: boolean
  constraints?: string
  of?: ContentField[]
}

export interface FieldContext {
  /** Component name, for override lookup and error messages. */
  component: string
  overrides: Overrides
  /** Upload collection an `image` field points at. */
  mediaCollection: string
  /** Collections an internal link may target. */
  linkCollections: string[]
  /** Resolves `select` options for `<Component>.<path>`, or null if it cannot. */
  resolveSelectOptions: (component: string, path: string) => readonly string[] | null
  /** Resolves a named exported union — used for the global icon set. */
  resolveNamedOptions: (typeName: string) => readonly string[] | null
}

/** The design system's exported union of every glyph name. */
const ICON_NAME_TYPE = 'IconName'

/** Above this, a single-line input stops being the right control. */
const TEXTAREA_THRESHOLD = 160

function describe(field: ContentField): string | undefined {
  return field.constraints
}

/**
 * A link, as one group rather than 41 ad-hoc ones.
 *
 * Internal links hold a relationship, not a path, so renaming a page cannot
 * break every link that pointed at it — the renderer resolves the current slug
 * at read time.
 *
 * `required` is enforced by a validate rather than by Payload's own flag, for
 * the reason `requiredLink` gives.
 */
export function linkField(
  name: string,
  ctx: FieldContext,
  description?: string,
  required = false,
): Field {
  return {
    name,
    type: 'group',
    ...(description ? { admin: { description } } : {}),
    ...(required ? { validate: requiredLink() } : {}),
    fields: [
      {
        name: 'mode',
        type: 'radio',
        defaultValue: 'internal',
        options: [
          { label: 'A page on this site', value: 'internal' },
          { label: 'Another site', value: 'external' },
          { label: 'Somewhere on this page', value: 'anchor' },
        ],
        admin: { layout: 'horizontal' },
      },
      {
        name: 'reference',
        type: 'relationship',
        // The package is generic over any Payload config, so it cannot know
        // this project's slugs; `CollectionSlug` is generated per app.
        relationTo: ctx.linkCollections as CollectionSlug[],
        admin: { condition: (_d, sibling) => sibling?.mode === 'internal' },
      },
      {
        name: 'url',
        type: 'text',
        admin: {
          condition: (_d, sibling) => sibling?.mode === 'external',
          description: 'Include the protocol — https://…',
        },
      },
      {
        name: 'anchor',
        type: 'text',
        admin: {
          condition: (_d, sibling) => sibling?.mode === 'anchor',
          description: 'The id of the element to scroll to, without the #.',
        },
      },
      {
        name: 'newTab',
        type: 'checkbox',
        admin: {
          condition: (_d, sibling) => sibling?.mode === 'external',
          description:
            'Opening a new tab takes the back button away, so reserve it for leaving the site.',
        },
      },
    ],
  }
}

/**
 * Turns one contract field into one Payload field.
 *
 * Returns null when the field is deliberately not authorable — an omitted
 * runtime-state field, or a slot, which is a component position rather than
 * content and is filled by the template.
 */
export function toPayloadField(
  field: ContentField,
  ctx: FieldContext,
  path: string = field.name,
): Field | null {
  const override = fieldOverride(ctx.overrides, ctx.component, path)
  if (override?.omit) return null

  const description = describe(field)
  const admin = description ? { admin: { description } } : {}
  const required = field.required ? { required: true } : {}

  if (override?.as === 'icon') {
    const options =
      override.options ??
      ctx.resolveSelectOptions(ctx.component, path) ??
      ctx.resolveNamedOptions(ICON_NAME_TYPE)
    if (!options) {
      throw new Error(
        `${ctx.component}.${path} is marked as an icon field but no options could be resolved, ` +
          `and neither could the design system's ${ICON_NAME_TYPE}.`,
      )
    }
    return { name: field.name, type: 'select', options: [...options], ...required, ...admin }
  }

  switch (field.type) {
    case 'text': {
      /*
      A text field whose prop is a union of string literals is a select that
      the contract could not say was one — `ContentField` has ten types and no
      way to mean "one of these names". The component's own type does say it,
      so read it: `IntroSection.actions[].icon` is `keyof typeof Icons`, and a
      free-text box there would let an author type a glyph name that renders
      nothing at all.
      */
      const asUnion = ctx.resolveSelectOptions(ctx.component, path)
      if (asUnion) {
        return { name: field.name, type: 'select', options: [...asUnion], ...required, ...admin }
      }
      // A 600-character answer in a single-line input is a usability bug, not
      // a styling preference. `text` and `textarea` are separate field types in
      // Payload, so the branch has to produce whole objects rather than a
      // computed `type`.
      const long = field.maxLength === undefined || field.maxLength > TEXTAREA_THRESHOLD
      const length = field.maxLength === undefined ? {} : { maxLength: field.maxLength }
      return long
        ? { name: field.name, type: 'textarea', ...length, ...required, ...admin }
        : { name: field.name, type: 'text', ...length, ...required, ...admin }
    }

    case 'number':
      return { name: field.name, type: 'number', ...required, ...admin }

    case 'boolean':
      // `required` on a checkbox would mean "must be ticked", which is never
      // what a contract means by it.
      //
      // `defaultValue` was hardcoded `false` here, which made a component's own
      // default unreachable: `coerce` turns whatever is stored into a real
      // boolean, so the prop is never `undefined` and a signature default like
      // `hasFacade = true` can never apply. A contract that wants the box
      // ticked to begin with now says so and is believed.
      return {
        name: field.name,
        type: 'checkbox',
        defaultValue: field.defaultValue ?? false,
        ...admin,
      }

    case 'richtext':
      return { name: field.name, type: 'richText', ...required, ...admin }

    case 'image':
      return {
        name: field.name,
        type: 'upload',
        relationTo: ctx.mediaCollection as CollectionSlug,
        ...required,
        ...admin,
      }

    case 'video':
      /*
      Two kinds of video wear the same contract type, and the override is what
      tells them apart.

      `videoUpload` is a file the site serves itself — `VideoHero`'s background
      clip — so it is an upload against the same media collection an image
      uses, which already accepts `video/mp4`. Everything else is a provider
      embed URL: `VideoEmbed` takes a YouTube/Vimeo/Wistia src and has a
      separate `poster` field that *is* an image.
      */
      if (override?.as === 'videoUpload') {
        return {
          name: field.name,
          type: 'upload',
          relationTo: ctx.mediaCollection as CollectionSlug,
          ...required,
          ...admin,
        }
      }
      return {
        name: field.name,
        type: 'text',
        ...required,
        admin: {
          description: description ?? 'A YouTube or Vimeo URL.',
        },
      }

    case 'link':
      return linkField(field.name, ctx, description, field.required)

    case 'select': {
      const options = override?.options ?? ctx.resolveSelectOptions(ctx.component, path)
      if (!options) {
        throw new Error(
          `${ctx.component}.${path} is a select, but its allowed values could not be resolved. ` +
            `The manifest does not carry them — they live in the component's own literal union ` +
            `type, or in an \`options\` override when it has none.`,
        )
      }
      return { name: field.name, type: 'select', options: [...options], ...required, ...admin }
    }

    case 'group': {
      // A group with no children is a *slot* — a place a component renders
      // another component, declared in `composition.allowedSlots`. It holds no
      // authored content, so there is nothing to put in the CMS.
      if (!field.of || field.of.length === 0) return null

      const children = childFields(field.of, ctx, path)

      /*
      An optional group holds its children to a weaker promise than it looks.

      `ProseSection.image` is `required: false` with `src` and `alt` both
      required inside it — meaning "an image is optional, but a *half* image is
      not". Generated literally, Payload validates those children whether or
      not the group has anything in it, so every block carrying an optional
      image became a block that could not be published without one. Six of the
      eight blocks on the About page failed that way.

      So inside an optional group the children are relaxed, and the promise the
      contract actually made is enforced on the group instead: fill it or leave
      it, but do not half-fill it.
      */
      if (field.required) {
        return { name: field.name, type: 'group', ...admin, fields: children }
      }

      return {
        name: field.name,
        type: 'group',
        ...admin,
        validate: allOrNothing(field.of),
        fields: relaxRequired(children),
      }
    }

    case 'array': {
      if (!field.of || field.of.length === 0) {
        throw new Error(`${ctx.component}.${path} is an array with no \`of\` describing its rows.`)
      }
      return {
        name: field.name,
        type: 'array',
        // Payload has no "required array"; a minimum of one row is what the
        // contract means.
        ...(field.required ? { minRows: 1 } : {}),
        ...admin,
        fields: childFields(field.of, ctx, path),
      }
    }
  }
}

/**
 * Strip `required` from a group's children, recursing into nested groups.
 *
 * Only ever applied inside an optional group — see the `group` case. An array
 * keeps its `minRows`, because Payload does not enforce rows on an array whose
 * parent group is empty.
 */
function relaxRequired(fields: Field[]): Field[] {
  return fields.map(field => {
    const next = 'required' in field && field.required ? { ...field, required: false } : field
    return 'fields' in next && Array.isArray(next.fields) && next.type === 'group'
      ? { ...next, fields: relaxRequired(next.fields) }
      : next
  })
}

/**
 * "Fill it or leave it, but do not half-fill it."
 *
 * The validation an optional group needs and Payload has no field-level way to
 * express: silent while the group is empty, and demanding of exactly the
 * children the contract marked required once any of them is filled in.
 */
function allOrNothing(children: ContentField[]) {
  const names = children.filter(child => child.required).map(child => child.name)

  /*
  Booleans this group defaults to ticked.

  `isEmpty` answers for a value alone and reads `false` as "nobody touched
  this", which is right for a checkbox that starts unticked. A checkbox the
  contract starts *ticked* says the same thing with the opposite value, and
  `isEmpty` cannot know that without being told which field it is looking at.
  Left unhandled, such a field makes its group permanently non-empty and
  `allOrNothing` demands the group's required children of an author who has
  typed nothing — the third route to the defect this file's `isEmpty` comment
  describes.
  */
  const defaultTicked = new Set(
    children.filter(child => child.type === 'boolean' && child.defaultValue === true).map(child => child.name),
  )

  const untouched = (name: string, v: unknown) =>
    defaultTicked.has(name) ? v === true || isEmpty(v) : isEmpty(v)

  return (value: unknown): true | string => {
    if (!value || typeof value !== 'object') return true

    const entries = Object.entries(value as Record<string, unknown>)

    if (entries.every(([k, v]) => untouched(k, v))) return true

    const missing = names.filter(name => isEmpty((value as Record<string, unknown>)[name]))
    if (missing.length === 0) return true

    return missing.length === 1
      ? `${missing[0]} is needed once anything else here is filled in. Clear the rest to leave this out entirely.`
      : `${missing.join(' and ')} are needed once anything else here is filled in. Clear the rest to leave this out entirely.`
  }
}

/**
 * A required link must actually go somewhere.
 *
 * `required: true` on a contract link field bought nothing for as long as this
 * generator existed: the flag was read for every other field type and dropped
 * for this one, and Payload's own `required` could not have replaced it anyway
 * — on a group it asserts only that the object exists, which it always does,
 * and on the children it would demand a `url` of a link whose author chose the
 * internal mode. So the promise is kept here, against the branch the author
 * actually picked.
 *
 * It cost a live defect. `FeaturedWork` marks each item's `href` required and
 * types it `string`; two items on `/work` were saved with the link untouched,
 * `resolveHref` returned `undefined`, React dropped the attribute, and the page
 * shipped four `<a>` elements with no `href` — not links at all: skipped by
 * crawlers, unreachable by keyboard, and scoring 0 on Lighthouse's
 * `crawlable-anchors`. Nothing in the CMS had objected. See #483.
 *
 * **Silent until the surroundings are filled in.** A block or an array row
 * Payload has only just created holds defaults, and refusing to save one before
 * anybody has typed into it is the #354 defect — an error on a block the editor
 * cannot yet act on. So the rule reads its siblings: everything around it empty
 * means nobody has been here, and the link is left alone. That is the same
 * bargain `allOrNothing` strikes one level up, and it lands on the case that
 * matters — a row carrying a title and a paragraph and no destination.
 */
function requiredLink() {
  return (value: unknown, options?: { siblingData?: unknown }): true | string => {
    const link = (value ?? {}) as {
      mode?: string | null
      reference?: unknown
      url?: unknown
      anchor?: unknown
    }

    const mode = link.mode ?? 'internal'
    if (mode === 'internal' && !isEmpty(link.reference)) return true
    if (mode === 'external' && !isEmpty(link.url)) return true
    if (mode === 'anchor' && !isEmpty(link.anchor)) return true

    if (isEmpty(options?.siblingData)) return true

    if (mode === 'external') return 'Enter the URL this link goes to.'
    if (mode === 'anchor') return 'Name the id this link scrolls to.'
    return 'Choose the page this link goes to.'
  }
}

/*
"Nobody has been here yet", and why it has to be recursive — which is not
obvious until it bites.

A group holding a link sub-group is never literally empty: `linkField` gives
`mode` a default of `'internal'`, so an untouched `caseStudy` arrives as
`{ stat: {}, href: { mode: 'internal' } }`. Compared shallowly that is a filled
group, and `allOrNothing` then demands the title of an author who has typed
nothing — that validation firing on exactly the case it exists to allow.

`mode` is skipped for that reason: it is a discriminator that says which *kind*
of link this would be if there were one, and it is present whether or not
anybody chose anything. It is never evidence that a group was filled in.

**An unticked checkbox is the same thing, and is why `false` counts as empty.**
`boolean` fields are generated with `defaultValue: false` unless the contract
declares otherwise, so a group holding one is never literally empty either — and `false` is indistinguishable from
"nobody touched this", because Payload stores the default and an author's
deliberate untick identically. Treating it as filled makes the rule demand the
group's required children of somebody who has typed nothing, which is the same
defect this comment already describes, arriving by a second route.

It did arrive: `ManagedForm.consent` holds a `required` boolean beside a
required `text`, and adding the block failed to save with "Consent is invalid"
before an editor could touch it.

A checkbox the contract starts *ticked* says "nobody touched this" with `true`
instead, which this function cannot see — it is handed a value, not a field.
`allOrNothing` knows the field shapes and handles that case itself.

`requiredLink` asks the same question of a link's *siblings*, which is what
keeps it quiet on a block or a row nobody has typed into yet.
*/
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (value === false) return true
  if (Array.isArray(value)) return value.every(isEmpty)
  if (typeof value === 'object') {
    return Object.entries(value).every(([key, held]) => key === 'mode' || isEmpty(held))
  }
  return false
}

function childFields(children: ContentField[], ctx: FieldContext, parentPath: string): Field[] {
  const fields = children
    .map(child => toPayloadField(child, ctx, `${parentPath}.${child.name}`))
    .filter((f): f is Field => f !== null)

  if (fields.length === 0) {
    throw new Error(
      `${ctx.component}.${parentPath} has no authorable children left after overrides. ` +
        `Payload rejects a group or array with an empty \`fields\`.`,
    )
  }
  return fields
}
