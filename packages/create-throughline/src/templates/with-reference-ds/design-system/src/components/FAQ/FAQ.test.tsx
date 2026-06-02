import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FAQ } from './FAQ.js'

describe('FAQ', () => {
  const items = [
    { question: 'Q1', answer: 'A1' },
    { question: 'Q2', answer: 'A2' },
  ]

  it('renders each question inside a details/summary', () => {
    const { container } = render(<FAQ items={items} />)
    const details = container.querySelectorAll('details')
    expect(details).toHaveLength(2)
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByText('Q2')).toBeInTheDocument()
  })

  it('opens the first item when defaultOpenFirst is true', () => {
    const { container } = render(<FAQ items={items} defaultOpenFirst />)
    const details = container.querySelectorAll('details')
    expect(details[0]).toHaveAttribute('open')
    expect(details[1]).not.toHaveAttribute('open')
  })

  it('renders the headline as h2 when provided', () => {
    render(<FAQ headline="Help" items={items} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Help')
  })
})
