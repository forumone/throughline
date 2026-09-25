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
