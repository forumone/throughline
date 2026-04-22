import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Quote',
  category: 'media',
  description:
    'A pullquote or testimonial rendered as a <figure> with a <blockquote> and optional figcaption attribution.',
  intent:
    'Surface a single human-scale quotation — a testimonial, a pullquote, a foundational claim. Use sparingly; quotes lose weight when stacked. The attribution is optional because some quotes stand on their own without a named author.',

  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: ['Quote'],
  },

  content: {
    fields: [
      {
        name: 'quote',
        type: 'text',
        required: true,
        maxLength: 400,
        constraints: 'One or two sentences; longer belongs in Prose',
      },
      {
        name: 'attribution',
        type: 'group',
        required: false,
        of: [
          { name: 'name', type: 'text', required: true, maxLength: 80 },
          { name: 'role', type: 'text', required: false, maxLength: 100 },
          { name: 'avatar', type: 'image', required: false },
        ],
      },
    ],
    variants: [
      { name: 'default', description: 'Standard size', whenToUse: 'Most testimonials and pullquotes' },
      { name: 'large', description: 'Oversized display treatment', whenToUse: 'Editorial openers or mission-page quotes that carry real weight' },
    ],
  },

  tokens: {
    consumes: [
      'color.text.primary',
      'color.text.secondary',
      'spacing.10',
      'spacing.6',
      'spacing.3',
      'spacing.container',
      'font.size.4xl',
      'font.size.2xl',
      'font.size.sm',
      'font.weight.semibold',
      'line.height.tight',
      'line.height.snug',
      'radius.full',
    ],
    configurable: [
      { prop: 'size', tokenGroup: 'layout', allowedValues: ['default', 'large'] },
    ],
  },

  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior:
      'Rendered as <figure> containing a <blockquote>; attribution is read as the figcaption. Decorative quotation marks are generated via CSS and are not in the accessible name.',
    contentWarnings: [
      'Do not quote someone without permission',
      'Use their actual words; a paraphrase inside quotation marks misrepresents them',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Testimonial with role', storyId: 'quote--default' },
    { label: 'With avatar', intent: 'Testimonial with portrait', storyId: 'quote--with-avatar' },
    { label: 'Large', intent: 'Editorial mission statement', storyId: 'quote--large' },
    { label: 'Without attribution', intent: 'Aphoristic pullquote', storyId: 'quote--without-attribution' },
  ],

  antiExamples: [
    {
      label: 'Four quotes in a row',
      why: 'Quote is meant to punctuate content, not fill a page',
      useInstead: 'Pick the strongest quote; move the rest into Prose or a CardGrid of Cards',
    },
    {
      label: 'Using Quote for product blurbs',
      why: 'Quote implies a real human author; marketing copy without a source undermines trust',
      useInstead: 'CTASection or Prose',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
