import type { ContentField } from './fields'

/*
What an author reads above a field, derived from the name a developer gave it.

Payload's own fallback title-cases the camelCase name, which is how the editor
came to ask for a "Cta Href" and an "Image Alt": three words an author has to
translate before they can type anything, one of them an HTML attribute. So
every generated field gets an explicit label, made the same way Payload makes
one but in sentence case and through a short vocabulary of the words that
mean something only to the person who wrote the component.

A name that humanizes badly *and* does not decompose into better words is
spelled out in `NAMES`. That table is global rather than per-component on
purpose: `isOpen` means "open when the page loads" in every accordion that has
one, and a label that differed between two of them would be a second thing for
an author to learn.
*/

/** Whole names that read badly however their words are translated. */
const NAMES: Record<string, string> = {
  children: 'Text',
  isOpen: 'Open on page load',
  numCols: 'Columns',
  hasFacade: 'Load the player only on click',
  subHeading: 'Subheading',
  metaParts: 'Details',
  part: 'Detail',
  newTab: 'Open in a new tab',
  imageOne: 'First image',
  imageTwo: 'Second image',
  poster: 'Poster image',
  videoSrc: 'Background video',
  chipLabel: 'Format',
  displayWord: 'Decorative word',
  bleed: 'Bleed edge',
  breakout: 'Break out of the column',
  surface: 'Background',
  submitLabel: 'Button text',
  applyLabel: 'Apply link text',
  pendingMessage: 'Message while sending',
  invalidMessage: 'Message when a field needs fixing',
  copyUrl: 'URL to copy',
  copiedLabel: 'Copied confirmation',
  copyErrorLabel: 'Copy failed message',
  playLabel: 'Play button label',
  pauseLabel: 'Pause button label',
}

/** Single words that are code, abbreviations, or a brand's own spelling. */
const WORDS: Record<string, string> = {
  cta: 'CTA',
  href: 'link',
  url: 'URL',
  id: 'ID',
  alt: 'alt text',
  faq: 'FAQ',
  faqs: 'FAQs',
  linkedin: 'LinkedIn',
}

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(word => word.toLowerCase())
}

function sentence(parts: string[]): string {
  const text = parts.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** `ctaLabel` → `CTA label`, `imageAlt` → `Image alt text`, `viewAllHref` → `View all link`. */
export function humanizeField(name: string): string {
  const named = NAMES[name]
  if (named) return named
  return sentence(words(name).map(word => WORDS[word] ?? word))
}

/**
 * The label for one generated field.
 *
 * `src` is the one word whose meaning depends on the field's type rather than
 * its name: an upload called `src` is the image, or the video, that its group
 * is about, and "Src" is the attribute that happens to carry it.
 */
export function labelFor(field: Pick<ContentField, 'name' | 'type'>): string {
  const parts = words(field.name)
  if (parts[parts.length - 1] === 'src' && !NAMES[field.name]) {
    const rest = parts.slice(0, -1)
    const noun = field.type === 'video' ? 'video' : 'image'
    // A bare video `src` is a provider's embed address, not a file.
    if (rest.length === 0 && noun === 'video') return 'Video URL'
    // `videoSrc` is "Video", not "Video video".
    if (rest.length === 0 || rest[rest.length - 1] === noun) {
      return sentence(rest.length === 0 ? [noun] : rest.map(word => WORDS[word] ?? word))
    }
    return sentence([...rest.map(word => WORDS[word] ?? word), noun])
  }
  return humanizeField(field.name)
}

/**
 * The heading over a label and the link it names, from the prefix they share.
 *
 * `cta` → "Call to action", `primaryCta` → "Primary call to action",
 * `viewAll` → "View all link", `register` → "Register link". A prefix that
 * already ends in "link" is not given a second one.
 */
export function pairTitle(prefix: string): string {
  const parts = words(prefix)
  const last = parts[parts.length - 1]
  if (last === 'cta') return sentence([...parts.slice(0, -1).map(w => WORDS[w] ?? w), 'call to action'])
  const translated = parts.map(word => WORDS[word] ?? word)
  return sentence(last === 'link' ? translated : [...translated, 'link'])
}

/*
What an author reads in a dropdown.

Generated options were bare strings, so Payload showed the value: an author
chose between `text-image` and `two-image`, `h2` and `h3`, `aside` and `band`,
and the field's description had to make up for it in code voice — "h2 | h3 |
h4. Defaults to h3." So every option now carries a label, from, in order:

1. the host's own vocabulary, for values whose meaning is particular to its
   design system (`text-image` is "Text and image" only because of what that
   component draws — `GenerateOptions.optionLabels`);
2. `VALUES` below, for the values that mean the same thing in any design
   system — a heading level, an HTML element, a form input type;
3. the value's own words, sentence-cased the way field names are.

A ratio is left as it is written. "16:9" is the word for it.
*/

/** Values that are code, and mean the same thing wherever they appear. */
const VALUES: Record<string, string> = {
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  p: 'Paragraph',
  div: 'Block',
  li: 'List item',
  span: 'Inline',
  tel: 'Phone number',
  textarea: 'Long text',
  select: 'Dropdown',
  radio: 'Radio buttons',
}

/** The label for one select option's value. */
export function optionLabel(value: string, vocabulary: Readonly<Record<string, string>> = {}): string {
  const own = vocabulary[value] ?? VALUES[value]
  if (own) return own
  if (/^\d+:\d+$/.test(value)) return value
  return sentence(words(value).map(word => WORDS[word] ?? word))
}

/** A picker shelf's name, with the same acronyms field labels use: `cta` → `CTA`. */
export function groupLabel(group: string): string {
  const parts = words(group).map(word => WORDS[word] ?? word)
  return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

/** Words a sentence that only lists a select's values is made of, besides the values. */
const LISTING_WORDS = new Set(['default', 'defaults', 'to', 'or', 'and', 'one', 'of', 'optional'])

/**
 * A select's description without the sentences that only restate its options.
 *
 * Contracts describe a select's values in prose — "h2 | h3 | h4. Defaults to
 * h3. Match the page outline." — because the manifest carries no options and
 * the prose is also what the components MCP server hands to a composing model,
 * which does want the list. In the admin the options are labelled, so those
 * sentences are noise and the guidance after them is kept.
 *
 * Except for one fact they carry. A generated select has no `defaultValue` —
 * the component's own default applies to an unset prop — so the dropdown opens
 * empty, and "Defaults to h3" is the only place an author learns what empty
 * means. A dropped sentence that named a default is replaced by that fact in
 * the options' own words: "Leave empty for Heading 3."
 *
 * `undefined` when nothing is left.
 */
export function selectDescription(
  description: string | undefined,
  values: readonly string[],
  label: (value: string) => string = value => optionLabel(value),
): string | undefined {
  if (!description) return undefined
  const byLength = [...values].sort((a, b) => b.length - a.length)
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const valuePattern = (value: string) =>
    new RegExp(`(?<![\\w-])${escape(value.toLowerCase())}(?![\\w-])`, 'g')

  const listsOnly = (part: string) => {
    let rest = ` ${part.toLowerCase()} `
    for (const value of byLength) rest = rest.replace(valuePattern(value), ' ')
    return rest
      .replace(/['"“”‘’()|,.;:]/g, ' ')
      .split(/\s+/)
      .every(word => word === '' || LISTING_WORDS.has(word))
  }

  const namedDefault = (part: string): string | undefined => {
    const lower = part.toLowerCase()
    return byLength.find(value => {
      const v = escape(value.toLowerCase())
      return (
        new RegExp(`defaults? to ['"“‘]?${v}(?![\\w-])`).test(lower) ||
        new RegExp(`(?<![\\w-])${v}['"”’]? \\(default\\)`).test(lower)
      )
    })
  }

  // Sentences, not splitting after "e.g." or "i.e.", which end in a full stop
  // and are followed by the example they introduce.
  const parts = description.split(/(?<!\b(?:e\.g|i\.e)\.)(?<=[.;])\s+/)
  let fallback: string | undefined
  const kept = parts.filter(part => {
    if (!listsOnly(part)) return true
    fallback ??= namedDefault(part)
    return false
  })

  const text = [
    ...(fallback ? [`Leave empty for ${label(fallback)}.`] : []),
    ...kept.map((part, i) =>
      // A clause that followed a semicolon starts lowercase.
      i === 0 || /[.!?]$/.test(kept[i - 1] ?? '') ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    ),
  ]
    .join(' ')
    .trim()
    // A kept clause whose second half was a dropped list ends on its semicolon.
    .replace(/;$/, '.')

  return text === '' ? undefined : text
}
