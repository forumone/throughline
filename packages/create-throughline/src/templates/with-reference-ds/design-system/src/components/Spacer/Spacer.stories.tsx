import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spacer, type SpacerSize } from './Spacer.js'

const meta: Meta<typeof Spacer> = {
  title: 'Spacer',
  component: Spacer,
}

export default meta

type Story = StoryObj<typeof Spacer>

function bracket(size: SpacerSize) {
  return (
    <div style={{ background: 'var(--color-bg-secondary)', padding: '0.5rem' }}>
      <p>Content above (size: {size})</p>
      <Spacer size={size} />
      <p>Content below</p>
    </div>
  )
}

export const Small: Story = { render: () => bracket('sm'), args: { size: 'sm' } }
export const Medium: Story = { render: () => bracket('md'), args: { size: 'md' } }
export const Large: Story = { render: () => bracket('lg'), args: { size: 'lg' } }
