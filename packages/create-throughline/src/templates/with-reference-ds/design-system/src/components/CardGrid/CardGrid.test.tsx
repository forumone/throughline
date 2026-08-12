import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CardGrid } from './CardGrid.js'

describe('CardGrid', () => {
  it('renders children', () => {
    render(
      <CardGrid>
        <div data-testid="a">A</div>
        <div data-testid="b">B</div>
      </CardGrid>,
    )
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })

  it('applies the columns modifier class', () => {
    const { container } = render(
      <CardGrid columns={4}>
        <div />
      </CardGrid>,
    )
    expect((container.firstChild as HTMLElement).className).toContain('cols-4')
  })
})
