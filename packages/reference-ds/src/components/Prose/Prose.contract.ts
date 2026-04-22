import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Prose',
  category: 'section',
  description:
    'A typographic container for long-form content — articles, policies, documentation, any flowing prose with headings and lists.',
  intent:
    'Wrap free-flowing editorial content with sensible typography defaults (heading hierarchy, paragraph rhythm, list styling, blockquote treatment). Use any time you have a block of content authored as rich text and you want it to read well without styling each element individually.',

  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: [],
  },

  content: {
    fields: [
      {
        name: 'children',
        type: 'richtext',
        required: true,
        constraints:
          'Rich text content authored in the CMS; can include h2-h4, paragraphs, lists, blockquotes, links',
      },
    ],
    variants: [
      {
        name: 'default',
        description: 'Standard reading rhythm',
        whenToUse: 'Most articles and editorial content',
      },
      {
        name: 'compact',
        description: 'Tighter spacing and line height',
        whenToUse: 'Denser reference content, product docs, or reading-room pages',
      },
      {
        name: 'spacious',
        description: 'Looser spacing and line height',
        whenToUse: 'Long-form essays where the reader benefits from breathing room',
      },
    ],
  },

  tokens: {
    consumes: [
      'color.text.primary',
      'color.text.secondary',
      'color.border.strong',
      'color.brand.primary',
      'spacing.container',
      'spacing.10',
      'spacing.8',
      'spacing.6',
      'spacing.5',
      'spacing.4',
      'spacing.2',
      'font.size.3xl',
      'font.size.2xl',
      'font.size.xl',
      'font.size.lg',
      'font.weight.semibold',
      'line.height.snug',
      'line.height.normal',
      'line.height.relaxed',
      'line.height.loose',
    ],
  },

  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior:
      'Children render as their native semantic HTML (h2, h3, p, ul, ol, blockquote, a). Prose adds no ARIA beyond what the authored content provides.',
    contentWarnings: [
      'Author h2 and below inside Prose; never h1 (the page already has one)',
      'Use real list markup, not paragraphs with bullets',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Standard article body', storyId: 'prose--default' },
    { label: 'Compact', intent: 'Reference or documentation page', storyId: 'prose--compact' },
    { label: 'Spacious', intent: 'Long-form essay or manifesto', storyId: 'prose--spacious' },
  ],

  antiExamples: [
    {
      label: 'Nesting Prose inside Prose',
      why: 'Creates duplicate typography scales and unpredictable spacing',
      useInstead: 'Use a single Prose at the outermost level',
    },
    {
      label: 'Putting interactive components inside Prose',
      why: 'Prose is for flowing editorial content; components like Stats or CardGrid have their own layout',
      useInstead: 'Close the Prose, render the component, open another Prose for continuing text',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
