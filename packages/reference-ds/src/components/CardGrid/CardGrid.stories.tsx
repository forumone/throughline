import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from '../Card/Card.js'
import { CardGrid } from './CardGrid.js'

const meta: Meta<typeof CardGrid> = {
  title: 'Card Grid',
  component: CardGrid,
}

export default meta

type Story = StoryObj<typeof CardGrid>

function sampleCards(count: number) {
  return Array.from({ length: count }, (_, index) => (
    <Card
      key={index}
      image={{ url: `https://placehold.co/640x360?text=${index + 1}`, alt: `Placeholder ${index + 1}` }}
      title={`Program ${index + 1}`}
      description="Short description of this program or piece of content."
      link={{ label: 'Learn more', url: '#' }}
    />
  ))
}

export const TwoColumn: Story = {
  args: { columns: 2, children: sampleCards(4) },
}

export const ThreeColumn: Story = {
  args: { columns: 3, children: sampleCards(6) },
}

export const FourColumn: Story = {
  args: { columns: 4, children: sampleCards(8) },
}
