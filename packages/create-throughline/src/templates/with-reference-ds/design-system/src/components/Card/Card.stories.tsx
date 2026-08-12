import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from './Card.js'

const meta: Meta<typeof Card> = {
  title: 'Card',
  component: Card,
}

export default meta

type Story = StoryObj<typeof Card>

export const Default: Story = {
  args: {
    image: { url: 'https://placehold.co/640x360', alt: 'Illustration of a forest' },
    title: 'Reforesting urban lots',
    description: 'Partners across three cities are turning vacant parcels into pollinator habitat.',
    link: { label: 'Read the story', url: '#' },
  },
}

export const WithEyebrow: Story = {
  args: {
    eyebrow: 'Program update',
    image: { url: 'https://placehold.co/640x360', alt: 'Researchers reviewing findings' },
    title: 'Year-one findings from the fellowship cohort',
    description: 'Five researchers, twelve publications, and a clearer picture of where to go next.',
    link: { label: 'View findings', url: '#' },
  },
}

export const NoImage: Story = {
  args: {
    title: 'Policy brief: Community-led adaptation',
    description: 'A short overview of our recommendations for local policymakers.',
    link: { label: 'Download brief', url: '#' },
  },
}

export const Static: Story = {
  args: {
    title: 'Mission statement',
    description: 'Content that supports the work of mission-driven organizations.',
  },
}
