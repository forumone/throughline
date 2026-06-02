import type { Meta, StoryObj } from '@storybook/react-vite'
import { FAQ } from './FAQ.js'

const meta: Meta<typeof FAQ> = {
  title: 'FAQ',
  component: FAQ,
}

export default meta

type Story = StoryObj<typeof FAQ>

export const Default: Story = {
  args: {
    headline: 'Frequently asked questions',
    items: [
      {
        question: 'Who is eligible to apply?',
        answer:
          'Researchers affiliated with accredited institutions whose work intersects climate and community resilience.',
      },
      {
        question: 'When is the application deadline?',
        answer:
          'Applications close on October 15th. Decisions are announced by December 1st of the same year.',
      },
      {
        question: 'What funding is available?',
        answer: 'Grants range from $25,000 to $100,000 depending on the scope of the project.',
      },
    ],
  },
}

export const OpenFirst: Story = {
  args: {
    defaultOpenFirst: true,
    headline: 'Common questions',
    items: [
      {
        question: 'Can I request an extension?',
        answer: 'Yes, one 30-day extension is allowed per application cycle.',
      },
      {
        question: 'What does the reporting look like?',
        answer: 'A mid-grant report at six months and a final report at twelve months.',
      },
    ],
  },
}

export const NoHeadline: Story = {
  args: {
    items: [
      {
        question: 'Is my data private?',
        answer: 'All submissions are confidential and visible only to the review committee.',
      },
    ],
  },
}
