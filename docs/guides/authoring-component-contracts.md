# Authoring component contracts

A good contract makes Claude useful with your design system. A bad contract turns Claude into a guess machine. The difference is mostly editorial — how you express intent — not technical.

This guide covers the practical "how do I write one?" If you haven't read [Design system contracts](../concepts/design-system-contracts.md) yet, do that first.

## Pick one component to start

Don't try to retrofit contracts across your whole DS at once. Pick the most-used component (typically Hero, Card, or CTASection), write a strong contract for it, and let it be the template.

A good first-contract candidate:

- Has clear editorial intent ("set up a topic" / "show three statistics")
- Has known anti-patterns you can articulate
- Has 3–5 examples in the wild
- Is visually distinctive enough that Claude needs reasoning to choose it

## The skeleton

```typescript
// packages/design-system/src/components/Hero/Hero.contract.ts
import { z } from 'zod'
import type { ComponentContract } from '@forumone/throughline-design-contract'

export const heroContract: ComponentContract = {
  name: 'Hero',
  description:
    'Page-opening section that establishes the topic in one short thought, ' +
    'optionally with up to two CTAs.',
  categories: ['hero', 'page-opener'],
  intents: [
    'introduce a topic at the top of a page',
    'set the focus for a campaign landing page',
    'frame a section as the entry point to a subject',
  ],
  storyId: 'components-hero--default',
  props: HeroPropsSchema,
  slots: {
    media: {
      maxItems: 1,
      allowedComponents: ['Image', 'Video'],
    },
  },
  tokens: ['color.brand.primary', 'color.text.heading', 'spacing.section'],
  examples: [/* see below */],
  antiExamples: [/* see below */],
}
```

Each field deserves attention. The tedious-feeling fields (`intents`, `antiExamples`) are the highest-leverage ones.

## Writing `description`

Two sentences. The first is what the component does; the second is when to use it.

Bad:

```
A hero section with a headline, body, and CTAs.
```

Good:

```
Page-opening section that establishes the topic in one short thought,
optionally with up to two CTAs. Use Hero when the page is *about* one
thing and you want that thing established before any other content.
```

The "when to use" half is what Claude trades on when choosing components. Without it, Claude relies on prop signatures.

## Writing `intents`

Write 3–6 short phrases describing what use-cases this component fits. Use real-language phrasing — these become matching targets for `propose_components`.

```typescript
intents: [
  'introduce a topic at the top of a page',
  'set the focus for a campaign landing page',
  'frame a section as the entry point to a subject',
],
```

Test by reading them aloud. If "introduce a topic at the top of a page" sounds like something a marketer would say in a brief, you've got the right register. If it sounds like a sentence from your DS source code, rephrase.

## Writing `props`

Use Zod (or a Zod-compatible schema). Keep it permissive enough to support the legitimate range of inputs, strict enough to reject obvious junk.

```typescript
const HeroPropsSchema = z.object({
  headline: z.string().min(1).max(120).describe('Single-line headline; ≤120 chars'),
  body: z.string().max(280).optional().describe('Optional sub-headline; ≤280 chars'),
  ctas: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        href: z.string().url(),
        variant: z.enum(['primary', 'secondary']),
      }),
    )
    .max(2)
    .optional()
    .describe('Up to two CTAs, primary first'),
  alignment: z.enum(['start', 'center']).default('start'),
})
```

Use `.describe(...)` on every field. Those descriptions are part of the contract Claude reads, not just JSDoc.

## Writing `examples`

Two to four examples per component, drawn from real layouts you've shipped (or would ship). Show variation — don't repeat the same shape with different copy.

```typescript
examples: [
  {
    description: 'Topic-establishing hero with one primary CTA',
    input: {
      headline: 'Building climate-resilient coastal cities',
      body: 'Our resilience program helps municipalities prepare.',
      ctas: [{ label: 'Learn more', href: '/programs/resilience', variant: 'primary' }],
    },
  },
  {
    description: 'Hero with no CTA (informational landing)',
    input: {
      headline: 'About Acme Climate',
    },
  },
  {
    description: 'Centered hero with two CTAs (campaign)',
    input: {
      headline: 'Pledge for the planet',
      body: 'Join the 2026 commitment.',
      ctas: [
        { label: 'Take the pledge', href: '/pledge', variant: 'primary' },
        { label: 'Read the manifesto', href: '/manifesto', variant: 'secondary' },
      ],
      alignment: 'center',
    },
  },
],
```

## Writing `antiExamples`

This is where the contract earns its keep. An anti-example is shaped the same as an example but flagged as wrong, with the reason. Claude treats anti-examples as constraints — it actively avoids matching them.

```typescript
antiExamples: [
  {
    description: 'Hero with three CTAs',
    input: {
      headline: 'Welcome',
      ctas: [primaryCta, secondaryCta, tertiaryCta],
    },
    reason:
      'Hero supports at most two CTAs. A third forces the visual hierarchy to collapse — both secondaries blend into a button row.',
  },
  {
    description: 'Hero used as a section divider mid-page',
    input: {
      headline: 'Our Programs',
    },
    reason:
      'Hero is for *opening* a page or major scope. Use SectionIntro for mid-page transitions; reserves the visual weight of a hero for moments that earn it.',
  },
  {
    description: 'Hero with body longer than 280 characters',
    input: {
      headline: 'The Complete Story',
      body: longText,
    },
    reason:
      'Heroes set a single thought, not deliver a paragraph. Use SectionIntro or Prose for longer content.',
  },
],
```

Three to five anti-examples per component is usually right. More than seven means the component is doing too much; consider splitting.

The `reason` field matters. "Just don't" tells Claude to avoid; "this collapses visual hierarchy" tells Claude *why* and lets it generalize to nearby cases.

## Writing `slots`

Slots are how a component contains other components. Each slot declares constraints:

```typescript
slots: {
  media: {
    description: 'Optional media accompanying the headline',
    maxItems: 1,
    allowedComponents: ['Image', 'Video'],
  },
  // No slot for CTAs — those are props, not slots, because they're scalar
  // values not nested components. Distinguish carefully.
},
```

Slots in your contract should mirror real slots in your component implementation (typically `children` or a named React prop). If a "slot" is really just a list of prop values, model it as a prop.

## Writing `tokens`

List the brand tokens the component reads. Helps Claude understand theming and helps the contract linter catch unused-token issues.

```typescript
tokens: [
  'color.brand.primary',
  'color.text.heading',
  'color.background.surface',
  'spacing.section',
  'font.heading',
],
```

Tokens are namespaced by category. The reference DS uses `color.*`, `spacing.*`, `font.*`, `radius.*` — use the same namespacing for consistency, even if your DS adds new categories.

## Linking to Storybook

Set `storyId` to the canonical Storybook story for the component. The contract linter cross-references the manifest with `storybook-static/index.json` so a contract pointing at a missing story fails CI.

Use the default story (the one that loads when you click into the component in Storybook), not a variant.

## Testing the contract

```bash
pnpm --filter @your-scope/design-system build
pnpm --filter @your-scope/design-system build-storybook
pnpm --filter @your-scope/design-system validate
```

`validate` runs `lintManifest` against your generated manifest, using the story IDs from `storybook-static/index.json`. Failures are structured (missing story, prop schema mismatch with example, anti-example shape error).

## Getting Claude's feedback on the contract

Once the contract is in your manifest:

```
Look at the Hero contract. Suggest an additional anti-example I might
have missed. Use real editorial reasoning, not just prop-shape rejection.
```

Claude reads the contract via `list_components`, reasons about it, and proposes additions. Treat its suggestions as a draft — pick the ones that match your editorial judgment, decline the rest.

## When to revise

- A new editorial guideline emerges → add an anti-example
- A new component variant ships → add a prop or update the prop schema
- A token gets renamed in the DS → update `tokens` lists across affected contracts
- Claude makes the same wrong choice twice → add an anti-example for that exact case

Contracts are living documents, more like design briefs than API docs. Revise them when the design system's editorial intent changes.
