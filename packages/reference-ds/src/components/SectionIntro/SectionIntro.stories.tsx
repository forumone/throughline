import type { Meta, StoryObj } from '@storybook/react-vite'
import { SectionIntro } from './SectionIntro.js'

const meta: Meta<typeof SectionIntro> = {
  title: 'SectionIntro',
  component: SectionIntro,
}

export default meta

type Story = StoryObj<typeof SectionIntro>

export const Default: Story = {
  args: {
    eyebrow: 'Our approach',
    headline: 'How we work with partners',
    body: 'We start with the content model, then the governance, then the visual design.',
  },
}

export const Centered: Story = {
  args: {
    alignment: 'center',
    headline: 'What we believe',
    body: 'Editorial teams deserve tools that take their workflows seriously.',
  },
}

export const HeadlineOnly: Story = {
  args: {
    headline: 'Recent work',
  },
}
