import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Stats',
  category: 'data',
  description:
    'A numerical data display with two to four stat items, each with a value, a label, and an optional description.',
  intent:
    'Surface a small set of headline metrics in a scannable row. Use for impact reports, program highlights, and annual summaries where numbers tell the story. Not appropriate for dense tabular data — that needs a real table component.',

  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: [],
  },

  content: {
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        required: false,
        maxLength: 40,
      },
      {
        name: 'headline',
        type: 'text',
        required: false,
        maxLength: 100,
      },
      {
        name: 'items',
        type: 'array',
        required: true,
        constraints: 'Two to four items',
        of: [
          { name: 'value', type: 'text', required: true, maxLength: 20 },
          { name: 'label', type: 'text', required: true, maxLength: 60 },
          { name: 'description', type: 'text', required: false, maxLength: 80 },
        ],
      },
    ],
  },

  tokens: {
    consumes: [
      'color.text.primary',
      'color.text.secondary',
      'color.brand.primary',
      'spacing.16',
      'spacing.10',
      'spacing.8',
      'spacing.3',
      'spacing.2',
      'spacing.1',
      'spacing.container',
      'font.size.5xl',
      'font.size.3xl',
      'font.size.sm',
      'font.weight.bold',
      'font.weight.semibold',
      'line.height.tight',
      'letter.spacing.wide',
    ],
  },

  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior:
      'Statistics are rendered as a <dl> with <dt>/<dd> pairs. Screen readers traverse each value + label + description as a definition list entry.',
    contentWarnings: [
      'Keep values concise — "4,200" instead of "4,200,000,000 dollars"',
      'Never invent numbers to fill the grid; use the real count even if unequal',
    ],
  },

  examples: [
    { label: 'Three stats', intent: 'Annual report highlights', storyId: 'stats--three-stats' },
    { label: 'Two stats', intent: 'Minimal impact summary', storyId: 'stats--two-stats' },
    { label: 'Four stats', intent: 'Dense overview', storyId: 'stats--four-stats' },
  ],

  antiExamples: [
    {
      label: 'Five or more stats',
      why: 'Beyond four items the layout cramps on mobile and the individual numbers lose impact',
      useInstead: 'Pick the top four; move the rest to a full report page',
    },
    {
      label: 'Paragraph-length values',
      why: 'Stats are designed for at-a-glance reading; long values overwhelm the layout',
      useInstead: 'Use Prose for extended narrative',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
