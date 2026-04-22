import type { Meta, StoryObj } from '@storybook/react-vite'
import { CTASection } from './CTASection.js'

const meta: Meta<typeof CTASection> = {
  title: 'CTASection',
  component: CTASection,
  parameters: { layout: 'fullscreen' },
}

export default meta

type Story = StoryObj<typeof CTASection>

export const Default: Story = {
  args: {
    headline: 'Ready to get started?',
    body: 'Create your first site in under an hour with a working content model.',
    cta: { label: 'Start building', url: '#' },
    secondaryCta: { label: 'Read the docs', url: '#' },
  },
}

export const PrimaryOnly: Story = {
  args: {
    headline: 'Join the next cohort',
    body: 'Applications close on October 15th.',
    cta: { label: 'Apply now', url: '#' },
  },
}

export const Inverse: Story = {
  args: {
    background: 'inverse',
    headline: 'Support our work',
    body: 'Your contribution makes this research possible.',
    cta: { label: 'Donate', url: '#' },
    secondaryCta: { label: 'Learn more', url: '#' },
  },
}
