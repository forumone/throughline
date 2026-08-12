import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Spacer',
  category: 'utility',
  description: 'An explicit vertical spacing block that inserts a token-sized gap between adjacent components.',
  intent:
    'Add breathing room between two components when neither component\'s own margins produce the right rhythm. Prefer component-owned spacing when possible; reach for Spacer only when layout composition requires it, such as between Stats and a following CardGrid on a dense page.',

  composition: {
    placement: ['page', 'section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: ['Spacer'],
  },

  content: {
    fields: [
      {
        name: 'size',
        type: 'select',
        required: false,
        constraints: 'xs | sm | md | lg | xl',
      },
    ],
    variants: [
      { name: 'xs', description: 'Extra small', whenToUse: 'Fine-grained adjustment' },
      { name: 'sm', description: 'Small', whenToUse: 'Between closely related elements' },
      { name: 'md', description: 'Medium (default)', whenToUse: 'Most cases' },
      { name: 'lg', description: 'Large', whenToUse: 'Between page sections that need visual separation' },
      { name: 'xl', description: 'Extra large', whenToUse: 'Major visual pauses on long landing pages' },
    ],
  },

  tokens: {
    consumes: ['spacing.2', 'spacing.4', 'spacing.8', 'spacing.16', 'spacing.24'],
    configurable: [
      { prop: 'size', tokenGroup: 'spacing', allowedValues: ['xs', 'sm', 'md', 'lg', 'xl'] },
    ],
  },

  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior:
      'Spacer is a presentational div marked aria-hidden. Assistive technology skips it entirely.',
    contentWarnings: [
      'Do not use Spacer to replace paragraph margins inside Prose — the typography already handles that',
    ],
  },

  examples: [
    { label: 'Small', intent: 'Subtle gap', storyId: 'spacer--small' },
    { label: 'Medium', intent: 'Standard gap', storyId: 'spacer--medium' },
    { label: 'Large', intent: 'Major section break', storyId: 'spacer--large' },
  ],

  antiExamples: [
    {
      label: 'Stacking multiple Spacers to achieve a custom size',
      why: 'Nesting spacers bypasses the token scale and makes spacing unauditable',
      useInstead: 'Pick the nearest size in the scale or adjust the neighboring components',
    },
    {
      label: 'Using Spacer for semantic breaks',
      why: 'Spacer has no semantic meaning; readers cannot tell one section has ended and another begun',
      useInstead: 'Divider (decorative=false) or SectionIntro',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
