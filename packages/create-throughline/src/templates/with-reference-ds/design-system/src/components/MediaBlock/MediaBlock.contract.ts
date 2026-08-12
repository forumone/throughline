import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'MediaBlock',
  category: 'media',
  description:
    'A full-width image or video block with optional caption and configurable aspect ratio.',
  intent:
    'Insert a single piece of featured media inside a content flow. Use for editorial imagery that deserves its own moment — a photograph illustrating a story, a portrait accompanying a quote, or a video introducing a program. Not a gallery; for multiple items compose a custom layout.',

  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: [],
  },

  content: {
    fields: [
      {
        name: 'media',
        type: 'group',
        required: true,
        of: [
          { name: 'type', type: 'select', required: true },
          { name: 'url', type: 'link', required: true },
          { name: 'alt', type: 'text', required: false, maxLength: 200 },
          { name: 'poster', type: 'image', required: false },
          { name: 'ariaLabel', type: 'text', required: false, maxLength: 120 },
        ],
      },
      {
        name: 'caption',
        type: 'text',
        required: false,
        maxLength: 200,
        constraints: 'One sentence that adds context the image alone cannot carry',
      },
    ],
    variants: [
      { name: '16:9', description: 'Cinematic widescreen', whenToUse: 'Most photographs and video' },
      { name: '4:3', description: 'Classic television ratio', whenToUse: 'Vintage or squared compositions' },
      { name: 'square', description: '1:1', whenToUse: 'Portraits or product shots' },
      { name: 'auto', description: 'Media\'s native ratio', whenToUse: 'Diagrams, infographics, or tall images' },
    ],
  },

  tokens: {
    consumes: [
      'color.bg.tertiary',
      'color.text.secondary',
      'spacing.container',
      'spacing.3',
      'font.size.sm',
      'radius.lg',
    ],
  },

  accessibility: {
    keyboardSupport: ['Video: native play/pause/seek controls'],
    screenReaderBehavior:
      'Images announce their alt text. Videos announce their aria-label (or fall back to native labeling). Captions are associated with the figure semantically via <figcaption>.',
    contentWarnings: [
      'Always author alt text for images that carry information; use empty alt ("") for purely decorative media',
      'Videos with spoken content must ship captions',
    ],
  },

  examples: [
    { label: 'Image with caption', intent: 'Editorial photograph', storyId: 'media-block--image' },
    { label: 'Square crop', intent: 'Portrait or product shot', storyId: 'media-block--square' },
    { label: 'Video', intent: 'Introductory video with poster', storyId: 'media-block--video' },
  ],

  antiExamples: [
    {
      label: 'Stacking three MediaBlocks for a gallery',
      why: 'MediaBlock is a spotlight element; stacking them creates awkward repetition without true gallery ergonomics',
      useInstead: 'Build a dedicated gallery component in your client DS',
    },
    {
      label: 'Decorative image with invented alt text',
      why: 'Screen readers read the alt text; inventing "people smiling" for decorative media wastes listener attention',
      useInstead: 'Use alt="" for purely decorative media',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
