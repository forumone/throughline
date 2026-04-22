import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Divider',
  category: 'utility',
  description: 'A horizontal rule for separating sections of content.',
  intent:
    'Mark a visual pause between two blocks of content without introducing a new section header. Use sparingly — a SectionIntro is usually a better signal of a new topic. Divider is for rhythm, not hierarchy.',

  composition: {
    placement: ['page', 'section', 'inline'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: ['Divider'],
  },

  content: {
    fields: [
      {
        name: 'spacing',
        type: 'select',
        required: false,
        constraints: 'compact | default | spacious',
      },
      {
        name: 'decorative',
        type: 'boolean',
        required: false,
        constraints: 'When true (default), the divider is aria-hidden',
      },
    ],
    variants: [
      { name: 'compact', description: 'Small vertical margin', whenToUse: 'Between tight pieces of content inside a list' },
      { name: 'default', description: 'Standard vertical margin', whenToUse: 'Most cases' },
      { name: 'spacious', description: 'Large vertical margin', whenToUse: 'Between major sections of a page' },
    ],
  },

  tokens: {
    consumes: [
      'color.border.default',
      'spacing.24',
      'spacing.12',
      'spacing.6',
    ],
    configurable: [
      { prop: 'spacing', tokenGroup: 'spacing', allowedValues: ['compact', 'default', 'spacious'] },
    ],
  },

  accessibility: {
    role: 'separator',
    keyboardSupport: [],
    screenReaderBehavior:
      'When decorative=true (default) the divider is marked aria-hidden and assistive tech skips it. When decorative=false it announces as a separator.',
    contentWarnings: [
      'Do not stack two Dividers in a row',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Standard section break', storyId: 'divider--default' },
    { label: 'Compact', intent: 'Between related list items', storyId: 'divider--compact' },
    { label: 'Spacious', intent: 'Between major page sections', storyId: 'divider--spacious' },
    { label: 'Meaningful', intent: 'Semantic section break announced by screen readers', storyId: 'divider--meaningful' },
  ],

  antiExamples: [
    {
      label: 'Using Divider instead of SectionIntro',
      why: 'Dividers carry no semantic meaning; readers cannot tell a new section has started without the accompanying headline',
      useInstead: 'SectionIntro',
    },
    {
      label: 'Decorative dividers announced to screen readers',
      why: 'Adds noise without value',
      useInstead: 'Leave decorative=true (the default)',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
