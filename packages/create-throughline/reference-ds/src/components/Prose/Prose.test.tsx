import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Prose } from './Prose.js'

describe('Prose', () => {
  it('renders child headings with their native semantics', () => {
    render(
      <Prose>
        <h2>Section</h2>
        <p>Body</p>
      </Prose>,
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section')
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('applies size variants', () => {
    const { container } = render(
      <Prose size="compact">
        <p>One</p>
      </Prose>,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('compact')
  })
})
