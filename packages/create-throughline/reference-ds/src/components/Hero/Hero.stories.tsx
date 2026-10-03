import type { Meta, StoryObj } from '@storybook/react-vite'
import { Hero } from './Hero.js'

const meta: Meta<typeof Hero> = {
  title: 'Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
}

export default meta

type Story = StoryObj<typeof Hero>

export const Default: Story = {
  args: {
    headline: 'Build tomorrow, starting today',
    body: 'An opinionated starting point for teams that take content seriously.',
    cta: { label: 'Learn more', url: '#' },
  },
}

export const ProgramLanding: Story = {
  args: {
    eyebrow: 'New program',
    headline: 'Fellowship for climate researchers',
    body: 'A one-year fellowship supporting researchers at the intersection of climate and community resilience.',
    cta: { label: 'Apply now', url: '#' },
    secondaryCta: { label: 'Learn about eligibility', url: '#' },
  },
}

export const Compact: Story = {
  args: {
    variant: 'compact',
    headline: 'About our work',
    body: 'Meet the team and learn how we approach our mission.',
  },
}

export const Split: Story = {
  args: {
    variant: 'split',
    eyebrow: 'Case study',
    headline: 'How we helped a foundation modernize its grant process',
    body: 'A twelve-month engagement that reduced processing time by 60% while improving applicant experience.',
    cta: { label: 'Read the case study', url: '#' },
    media: { url: 'https://placehold.co/800x600', alt: 'Foundation office' },
  },
}

export const Inverse: Story = {
  args: {
    background: 'inverse',
    headline: 'A darker opener',
    body: 'Use the inverse background when a hero needs to cut against surrounding content.',
    cta: { label: 'Get started', url: '#' },
  },
}
