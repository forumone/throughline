import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stats } from './Stats.js'

describe('Stats', () => {
  it('renders each item as a dt/dd pair inside a dl', () => {
    const { container } = render(
      <Stats
        items={[
          { value: '100', label: 'Projects' },
          { value: '50', label: 'Partners' },
        ]}
      />,
    )
    expect(container.querySelector('dl')).not.toBeNull()
    const dts = container.querySelectorAll('dt')
    const dds = container.querySelectorAll('dd')
    expect(dts).toHaveLength(2)
    expect(dds).toHaveLength(2)
    expect(dts[0]).toHaveTextContent('100')
    expect(dds[0]).toHaveTextContent('Projects')
  })

  it('renders optional eyebrow + headline', () => {
    render(
      <Stats
        eyebrow="Impact"
        headline="Summary"
        items={[{ value: '1', label: 'Thing' }]}
      />,
    )
    expect(screen.getByText('Impact')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Summary')
  })

  it('renders item description when present', () => {
    render(
      <Stats
        items={[{ value: '1', label: 'Thing', description: 'Extra context' }]}
      />,
    )
    expect(screen.getByText('Extra context')).toBeInTheDocument()
  })
})
