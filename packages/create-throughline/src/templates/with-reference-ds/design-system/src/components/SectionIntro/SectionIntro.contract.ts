import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'SectionIntro',
  category: 'section',
  description:
    'A section opener that establishes what the next block of content is about without competing with the page hero.',
  intent:
    'Introduce a new section inside a page. Use when you need an h2-level heading with optional eyebrow and supporting body copy, such as "Our approach", "Recent work", or "What we believe". Pairs with any content block below it.',

  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: ['SectionIntro'],
  },

  content: {
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        required: false,
        maxLength: 40,
        constraints: 'Short kicker label above the headline',
      },
      {
        name: 'headline',
        type: 'text',
        required: true,
        maxLength: 100,
        constraints: 'Sentence case; scannable; reads like a chapter title',
      },
      {
        name: 'body',
        type: 'text',
        required: false,
        maxLength: 240,
        constraints: 'One or two sentences that set up the section',
      },
    ],
    variants: [
      {
        name: 'start',
        description: 'Left-aligned',
        whenToUse: 'Default — pairs with left-aligned content blocks below',
      },
      {
        name: 'center',
        description: 'Center-aligned',
        whenToUse: 'Landing pages and marketing sections where the intro anchors a centered layout',
      },
    ],
  },

  tokens: {
    consumes: [
      'color.text.primary',
      'color.text.secondary',
      'spacing.container',
      'spacing.3',
      'spacing.2',
      'font.size.3xl',
      'font.size.lg',
      'font.size.sm',
      'font.weight.semibold',
      'line.height.snug',
      'line.height.relaxed',
      'letter.spacing.wide',
    ],
  },

  accessibility: {
    role: 'region',
    keyboardSupport: [],
    screenReaderBehavior:
      'The headline is announced as an h2 element. The eyebrow is supplementary text read before the headline. No interactive controls.',
    contentWarnings: [
      'Do not use SectionIntro before Hero on the same page — the page must start with a single h1',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Introduce a section inside a content page', storyId: 'section-intro--default' },
    { label: 'Centered', intent: 'Anchor a centered marketing section', storyId: 'section-intro--centered' },
    { label: 'Headline only', intent: 'Minimal section divider with just a heading', storyId: 'section-intro--headline-only' },
  ],

  antiExamples: [
    {
      label: 'Using SectionIntro as the page opener',
      why: 'SectionIntro renders h2; a page should begin with an h1 for accessibility and SEO',
      useInstead: 'Hero',
    },
    {
      label: 'Stacking two SectionIntros with no content between them',
      why: 'Creates a visual and semantic duplicate that signals nothing new',
      useInstead: 'Merge into a single SectionIntro with a longer body',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
