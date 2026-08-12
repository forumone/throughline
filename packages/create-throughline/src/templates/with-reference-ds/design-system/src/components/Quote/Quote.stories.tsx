import type { Meta, StoryObj } from '@storybook/react-vite'
import { Quote } from './Quote.js'

const meta: Meta<typeof Quote> = {
  title: 'Quote',
  component: Quote,
}

export default meta

type Story = StoryObj<typeof Quote>

export const Default: Story = {
  args: {
    quote:
      'The best CMS is the one your editorial team forgets they are using.',
    attribution: { name: 'Jordan Rivers', role: 'Design director' },
  },
}

export const WithAvatar: Story = {
  args: {
    quote:
      'After we moved to a content-first model, our publishing velocity nearly doubled without adding to the team.',
    attribution: {
      name: 'Maria Santos',
      role: 'Head of content, Greenfield Foundation',
      avatar: { url: 'https://placehold.co/80x80', alt: 'Portrait of Maria Santos' },
    },
  },
}

export const Large: Story = {
  args: {
    size: 'large',
    quote: 'Editorial teams deserve tools that take their workflows seriously.',
  },
}

export const WithoutAttribution: Story = {
  args: {
    quote: 'Content first. Everything else follows.',
  },
}
