import type { Meta, StoryObj } from '@storybook/react-vite'
import { Divider } from './Divider.js'

const meta: Meta<typeof Divider> = {
  title: 'Divider',
  component: Divider,
}

export default meta

type Story = StoryObj<typeof Divider>

export const Default: Story = {
  render: (args) => (
    <div>
      <p>Above the divider.</p>
      <Divider {...args} />
      <p>Below the divider.</p>
    </div>
  ),
}

export const Compact: Story = { ...Default, args: { spacing: 'compact' } }
export const Spacious: Story = { ...Default, args: { spacing: 'spacious' } }
export const Meaningful: Story = {
  ...Default,
  args: { decorative: false },
  parameters: {
    docs: {
      description: {
        story: 'Use decorative={false} when the divider marks a meaningful section break that assistive technology should announce.',
      },
    },
  },
}
