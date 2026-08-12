import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Card',
  category: 'card',
  description:
    'A single content card with optional image, eyebrow, title, description, and link. Renders as a link when a link target is provided.',
  intent:
    'Surface a single piece of content in a scannable, consistent shape — a program page, a blog post, a case study, a staff bio. Cards are typically laid out in a CardGrid, but a single Card can appear alone inside a section when the content warrants singular emphasis.',

  composition: {
    placement: ['section', 'inline'],
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
        maxLength: 30,
        constraints: 'Short label such as the content type ("Case study", "Program update")',
      },
      {
        name: 'image',
        type: 'image',
        required: false,
        constraints: 'Landscape orientation; framing works best for images that read at small sizes',
      },
      {
        name: 'title',
        type: 'text',
        required: true,
        maxLength: 100,
        constraints: 'Sentence case; reads like a headline',
      },
      {
        name: 'description',
        type: 'text',
        required: false,
        maxLength: 200,
        constraints: 'One to two sentences that give the reader a reason to click',
      },
      {
        name: 'link',
        type: 'group',
        required: false,
        of: [
          { name: 'label', type: 'text', required: true, maxLength: 30 },
          { name: 'url', type: 'link', required: true },
        ],
      },
    ],
    variants: [
      { name: 'linked', description: 'Entire card is clickable', whenToUse: 'Teaser for a single piece of content' },
      { name: 'static', description: 'No link; presentational only', whenToUse: 'Inline informational cards (team bios, program descriptions) that do not link elsewhere' },
    ],
  },

  tokens: {
    consumes: [
      'color.bg.primary',
      'color.bg.tertiary',
      'color.text.primary',
      'color.text.secondary',
      'color.border.default',
      'color.border.strong',
      'color.brand.primary',
      'spacing.6',
      'spacing.2',
      'font.size.xl',
      'font.size.base',
      'font.size.sm',
      'font.size.xs',
      'font.weight.semibold',
      'line.height.snug',
      'line.height.normal',
      'letter.spacing.wide',
      'radius.lg',
    ],
  },

  accessibility: {
    keyboardSupport: ['When linked, the whole card is a single tab stop'],
    screenReaderBehavior:
      'Linked cards render as a single <a> element announcing the title + description + link label as one unit. Static cards render as <article> with an h3 title.',
    contentWarnings: [
      'Avoid nested interactive elements inside a linked card (buttons, additional links)',
      'Always author alt text for card images or omit the image entirely',
    ],
  },

  examples: [
    { label: 'Default', intent: 'Content teaser with image and link', storyId: 'card--default' },
    { label: 'With eyebrow', intent: 'Labeled teaser highlighting content type', storyId: 'card--with-eyebrow' },
    { label: 'No image', intent: 'Text-only teaser for resources or downloads', storyId: 'card--no-image' },
    { label: 'Static', intent: 'Presentational card without a link target', storyId: 'card--static' },
  ],

  antiExamples: [
    {
      label: 'Nesting interactive controls inside a linked card',
      why: 'A linked card is a single tab stop; adding buttons or additional links creates nested interactive regions that confuse assistive technology',
      useInstead: 'Use a static card with explicit nested controls, or move secondary actions to a detail page',
    },
    {
      label: 'Using Card as a navigation menu item',
      why: 'Cards are for content teasers; site navigation belongs in a Menu or Nav component',
      useInstead: 'A dedicated navigation component',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
