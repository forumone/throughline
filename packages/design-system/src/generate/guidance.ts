import { componentDisplayName } from '../contract/display-name.js'

/*
What a block is for, in the one sentence an author reads before filling it in.

Every contract's `intent` starts with a sentence written for exactly this —
"Use once per page as the strongest possible prompt, normally just above the
footer." — and none of it reached the admin. The picker shows a thumbnail and a
name, so an author choosing between CTA, High Impact CTA and Assurance CTA had
the names to go on and nothing else.

The rest of the intent is for the composer: when to choose this over that,
what it must not sit next to. Useful, but a paragraph above every block is a
paragraph nobody reads, so only the first sentence is shown.

A sentence that names another component names it the way code does —
"Use exactly where you would use ImageHero" — so each manifest name is written
the way the picker labels it.
*/

/** The first sentence of `intent`, with component names as the picker shows them. */
export function blockGuidance(intent: string, componentNames: Iterable<string>): string {
  const first = intent.trim().split(/(?<=[.!?])\s+(?=[A-Z"“])/)[0] ?? ''
  const names = new Set(componentNames)
  return first.replace(/\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+\b/g, word =>
    names.has(word) ? humanize(word) : word,
  )
}

/** `CollageHero` → `Collage Hero`. The same rule the block labels use. */
export function humanize(name: string): string {
  return componentDisplayName(name)
}
