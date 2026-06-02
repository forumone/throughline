import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Hero',
  category: 'hero',
  description:
    'A page opener with prominent headline, supporting copy, and primary call to action.',
  intent:
    'Establish what a page is about within the first viewport. Use when the page introduces a new topic, program, or initiative that deserves prominent editorial framing. Typically appears once at the top of a page.',

  composition: {
    placement: ['page'],
    maxPerPage: 1,
    requiredSiblings: [],
    forbiddenAdjacent: ['Hero', 'SectionIntro'],
  },

  content: {
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        required: false,
        maxLength: 40,
        constraints: 'Short kicker label, typically the section or program name',
      },
      {
        name: 'headline',
        type: 'text',
        required: true,
        maxLength: 80,
        constraints: 'Sentence case; avoid all caps; keep scannable',
      },
      {
        name: 'body',
        type: 'text',
        required: false,
        maxLength: 240,
        constraints: 'Two to three sentences that support the headline without repeating it',
      },
      {
        name: 'cta',
        type: 'group',
        required: false,
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
      {
        name: 'media',
        type: 'image',
        required: false,
        constraints: 'Required when variant is "split"; otherwise optional',
      },
    ],
    variants: [
      {
        name: 'default',
        description: 'Centered text, no media',
        whenToUse: 'Editorial pages and mission statements where content carries the weight',
      },
      {
        name: 'compact',
        description: 'Reduced vertical padding',
        whenToUse: 'Subpages where the hero is contextual framing rather than primary introduction',
      },
      {
        name: 'split',
        description: 'Text on one side, media on the other',
        whenToUse: 'Program pages or anywhere a single supporting image carries meaning',
      },
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
      'spacing.12',
      'spacing.8',
      'spacing.6',
      'spacing.4',
      'spacing.3',
      'font.size.5xl',
      'font.size.4xl',
      'font.size.xl',
      'font.size.sm',
      'font.weight.bold',
      'font.weight.semibold',
      'line.height.tight',
      'line.height.relaxed',
      'letter.spacing.tight',
      'letter.spacing.wide',
      'radius.md',
      'radius.lg',
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
      'The headline is announced as an h1 element. The eyebrow is read as supplementary text before the headline. Decorative media is treated as presentational when the alt attribute is empty.',
    contentWarnings: [
      'Avoid text overlay on busy images',
      'Ensure sufficient color contrast between headline and background',
    ],
  },

  examples: [
    {
      label: 'Default',
      intent: 'Standard editorial page opener with CTA',
      storyId: 'hero--default',
    },
    {
      label: 'Program landing page',
      intent: 'Introduce a new fellowship program',
      storyId: 'hero--program-landing',
    },
    {
      label: 'Compact subpage',
      intent: 'Open a secondary page with light framing',
      storyId: 'hero--compact',
    },
    {
      label: 'Split with media',
      intent: 'Open a content page with supporting visual context',
      storyId: 'hero--split',
    },
  ],

  antiExamples: [
    {
      label: 'Multiple heroes on one page',
      why: 'A page should have a single primary opener; multiple heroes flatten hierarchy and confuse screen readers with multiple h1s',
      useInstead: 'Use SectionIntro for secondary section headers',
    },
    {
      label: 'Hero at the bottom of a page',
      why: 'Heroes are editorial openers, not closers',
      useInstead: 'Use CTASection for page-bottom calls to action',
    },
    {
      label: 'Split variant without media',
      why: 'The split layout allocates half the space for media; leaving it empty creates awkward whitespace',
      useInstead: 'Use the default variant when media is not available',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
