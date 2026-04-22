import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'FAQ',
  category: 'data',
  description:
    'A disclosure-style question and answer list using native <details>/<summary> for keyboard accessibility with no JavaScript.',
  intent:
    'Answer the predictable questions readers arrive with. Use for program applications, purchase funnels, onboarding pages — anywhere the same three to ten questions come up repeatedly. Not for searchable knowledge bases (those need their own search UI).',

  composition: {
    placement: ['section'],
    maxPerPage: 2,
    requiredSiblings: [],
    forbiddenAdjacent: [],
  },

  content: {
    fields: [
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
        constraints: 'Three to ten items; more than that needs its own dedicated page',
        of: [
          { name: 'question', type: 'text', required: true, maxLength: 200 },
          { name: 'answer', type: 'richtext', required: true },
        ],
      },
      {
        name: 'defaultOpenFirst',
        type: 'boolean',
        required: false,
        constraints: 'Set true when the first question is one readers always ask',
      },
    ],
  },

  tokens: {
    consumes: [
      'color.bg.primary',
      'color.text.primary',
      'color.text.secondary',
      'color.border.default',
      'color.border.strong',
      'spacing.16',
      'spacing.8',
      'spacing.5',
      'spacing.4',
      'spacing.2',
      'spacing.container',
      'font.size.3xl',
      'font.size.xl',
      'font.weight.semibold',
      'line.height.relaxed',
      'radius.md',
    ],
  },

  accessibility: {
    keyboardSupport: [
      'Tab to each question summary',
      'Enter or Space opens/closes the current item',
    ],
    screenReaderBehavior:
      'Each question is a <summary> inside <details>, so screen readers announce open/closed state natively. The answer becomes available to assistive tech when the item is expanded.',
    contentWarnings: [
      'Keep answers short and scannable — a paragraph at most',
      'Do not nest FAQs inside FAQs',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Program application FAQ', storyId: 'faq--default' },
    { label: 'First item open', intent: 'Lead with the most common question already answered', storyId: 'faq--open-first' },
    { label: 'Without headline', intent: 'Inline FAQ under a larger section', storyId: 'faq--no-headline' },
  ],

  antiExamples: [
    {
      label: 'Twenty-question FAQ',
      why: 'Past about ten items the disclosure pattern breaks down; readers cannot scan the list',
      useInstead: 'Split into topic-specific FAQs across multiple pages, or build a searchable knowledge base',
    },
    {
      label: 'Using FAQ to hide primary content',
      why: 'Important content should be visible by default, not hidden behind a click',
      useInstead: 'Prose or a proper section with a SectionIntro',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: true,
    animates: false,
    requiresAnalytics: false,
  },
}
