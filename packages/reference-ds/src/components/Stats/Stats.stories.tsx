import type { Meta, StoryObj } from '@storybook/react-vite'
import { Stats } from './Stats.js'

const meta: Meta<typeof Stats> = {
  title: 'Stats',
  component: Stats,
}

export default meta

type Story = StoryObj<typeof Stats>

export const ThreeStats: Story = {
  args: {
    eyebrow: 'Impact',
    headline: 'Year in review',
    items: [
      { value: '128', label: 'Grants awarded', description: 'Across twelve programs' },
      { value: '$4.2M', label: 'Total funded' },
      { value: '87%', label: 'Completion rate', description: 'Measured over five years' },
    ],
  },
}

export const TwoStats: Story = {
  args: {
    items: [
      { value: '30', label: 'Partner organizations' },
      { value: '1,200', label: 'Researchers supported' },
    ],
  },
}

export const FourStats: Story = {
  args: {
    headline: 'By the numbers',
    items: [
      { value: '12', label: 'Countries' },
      { value: '48', label: 'Programs' },
      { value: '300+', label: 'Publications' },
      { value: '5M', label: 'People reached' },
    ],
  },
}
