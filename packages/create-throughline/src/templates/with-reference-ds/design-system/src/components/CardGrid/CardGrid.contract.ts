import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'CardGrid',
  category: 'section',
  description:
    'A responsive layout container for two, three, or four Cards per row. Reflows to fewer columns on narrow viewports.',
  intent:
    'Lay out multiple Card components inside a section. Use for program lists, blog indexes, staff directories, and any collection of similarly-shaped content. CardGrid is purely layout; it does not fetch data or filter — authors list the Cards they want.',

  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: ['Card'],
    forbiddenAdjacent: [],
    allowedSlots: { children: ['Card'] },
  },

  content: {
    fields: [
      {
        name: 'children',
        type: 'array',
        required: true,
        constraints: 'An array of Card components',
        of: [{ name: 'card', type: 'group', required: true }],
      },
    ],
    variants: [
      { name: '2', description: 'Two columns', whenToUse: 'Lists of 2-4 prominent items' },
      { name: '3', description: 'Three columns', whenToUse: 'Default — works for most collections' },
      { name: '4', description: 'Four columns', whenToUse: 'Denser lists of 8 or more short cards' },
    ],
  },

  tokens: {
    consumes: ['spacing.container', 'spacing.6'],
    configurable: [
      { prop: 'columns', tokenGroup: 'layout', allowedValues: ['2', '3', '4'] },
    ],
  },

  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior:
      'Purely visual layout. Screen readers traverse children in source order; CardGrid itself adds no ARIA.',
    contentWarnings: [
      'Children must be Cards; mixing other components breaks the visual rhythm',
      'Keep all cards roughly the same content length — dramatically unequal cards look broken',
    ],
  },

  examples: [
    { label: 'Two columns', intent: 'Featured program pair', storyId: 'card-grid--two-column' },
    { label: 'Three columns', intent: 'Standard content index', storyId: 'card-grid--three-column' },
    { label: 'Four columns', intent: 'Dense staff directory', storyId: 'card-grid--four-column' },
  ],

  antiExamples: [
    {
      label: 'Mixing Cards and non-Card children',
      why: 'The grid assumes uniform children; mixing Stats or MediaBlocks produces broken columns',
      useInstead: 'Group by type — one CardGrid, then the other components below',
    },
    {
      label: 'Using CardGrid with a single Card',
      why: 'A CardGrid wrapping one Card is overhead without benefit',
      useInstead: 'Render the Card directly',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
