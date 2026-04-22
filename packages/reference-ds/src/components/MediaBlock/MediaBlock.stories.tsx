import type { Meta, StoryObj } from '@storybook/react-vite'
import { MediaBlock } from './MediaBlock.js'

const meta: Meta<typeof MediaBlock> = {
  title: 'Media Block',
  component: MediaBlock,
}

export default meta

type Story = StoryObj<typeof MediaBlock>

export const Image: Story = {
  args: {
    media: { type: 'image', url: 'https://placehold.co/1600x900', alt: 'Foundation staff at work' },
    caption: 'Team members gathered for the annual retreat.',
  },
}

export const Square: Story = {
  args: {
    aspect: 'square',
    media: { type: 'image', url: 'https://placehold.co/800x800', alt: 'Portrait' },
  },
}

export const Video: Story = {
  args: {
    media: {
      type: 'video',
      url: 'https://example.com/clip.mp4',
      poster: 'https://placehold.co/1600x900',
      ariaLabel: 'Introduction video',
    },
    caption: 'A three-minute introduction to the program.',
  },
}
