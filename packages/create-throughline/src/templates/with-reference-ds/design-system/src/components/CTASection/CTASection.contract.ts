import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'CTASection',
  category: 'cta',
  description:
    'A page-bottom call to action with a headline, optional supporting copy, and one or two buttons.',
  intent:
    'Close a page with a clear next step. Use at the end of program pages, campaigns, and marketing pages where the reader has enough context to act. Do not use at the top of a page (that is Hero\'s job) or as a section opener (that is SectionIntro\'s).',

  composition: {
    placement: ['page', 'section'],
    maxPerPage: 2,
    requiredSiblings: [],
    forbiddenAdjacent: ['CTASection'],
  },

  content: {
    fields: [
      {
        name: 'headline',
        type: 'text',
        required: true,
        maxLength: 100,
        constraints: 'Direct, imperative; reads like an invitation',
      },
      {
        name: 'body',
        type: 'text',
        required: false,
        maxLength: 200,
        constraints: 'One sentence that reduces friction to clicking',
      },
      {
        name: 'cta',
        type: 'group',
        required: true,
        of: [
          { name: 'label', type: 'text', required: true, maxLength: 30 },
          { name: 'url', type: 'link', required: true },
        ],
      },
      {
        name: 'secondaryCta',
        type: 'group',
        required: false,
        of: [
          { name: 'label', type: 'text', required: true, maxLength: 30 },
          { name: 'url', type: 'link', required: true },
        ],
      },
    ],
    variants: [
      { name: 'primary', description: 'Standard background', whenToUse: 'Default' },
      { name: 'secondary', description: 'Subtle grey background', whenToUse: 'Most page closes — less visual weight than Hero' },
      { name: 'inverse', description: 'Dark background', whenToUse: 'Campaign pages or high-stakes calls to action' },
    ],
  },

  tokens: {
    consumes: [
      'color.bg.primary',
      'color.bg.secondary',
      'color.bg.inverse',
      'color.text.primary',
      'color.text.secondary',
      'color.text.inverse',
      'color.brand.primary',
      'color.brand.primaryHover',
      'color.border.strong',
      'spacing.section',
      'spacing.container',
      'spacing.8',
      'spacing.6',
      'spacing.4',
      'spacing.3',
      'font.size.4xl',
      'font.size.lg',
      'font.weight.bold',
      'font.weight.semibold',
      'line.height.tight',
      'line.height.relaxed',
      'radius.md',
    ],
    configurable: [
      {
        prop: 'background',
        tokenGroup: 'color.bg',
        allowedValues: ['primary', 'secondary', 'inverse'],
      },
    ],
  },

  accessibility: {
    keyboardSupport: ['Tab to primary CTA', 'Tab to secondary CTA'],
    screenReaderBehavior:
      'The headline is announced as an h2. CTAs are standard links; their label text is announced as the link name.',
    contentWarnings: [
      'Avoid verb-only labels ("Click", "Go") — include the destination ("Start building", "Read the docs")',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Two-button page close', storyId: 'cta-section--default' },
    { label: 'Primary only', intent: 'Single-action CTA', storyId: 'cta-section--primary-only' },
    { label: 'Inverse', intent: 'High-contrast campaign CTA', storyId: 'cta-section--inverse' },
  ],

  antiExamples: [
    {
      label: 'Three or more CTAs',
      why: 'Too many options reduces conversion; pick the top one, put the rest on a detail page',
      useInstead: 'One primary + optional secondary',
    },
    {
      label: 'Using CTASection as a page opener',
      why: 'Readers cannot convert without context; CTA belongs at the end',
      useInstead: 'Hero',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: true,
  },
}
