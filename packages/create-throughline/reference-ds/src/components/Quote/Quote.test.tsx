import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Quote } from './Quote.js'

describe('Quote', () => {
  it('renders the quote inside a blockquote', () => {
    const { container } = render(<Quote quote="Content first." />)
    expect(container.querySelector('blockquote')).not.toBeNull()
    expect(screen.getByText('Content first.')).toBeInTheDocument()
  })

  it('renders the attribution inside a figcaption when provided', () => {
    const { container } = render(
      <Quote
        quote="Words."
        attribution={{ name: 'Ada Lovelace', role: 'Mathematician' }}
      />,
    )
    const caption = container.querySelector('figcaption')
    expect(caption).not.toBeNull()
    expect(caption).toHaveTextContent('Ada Lovelace')
    expect(caption).toHaveTextContent('Mathematician')
  })

  it('renders an avatar when attribution includes one', () => {
    render(
      <Quote
        quote="Words."
        attribution={{
          name: 'Grace Hopper',
          avatar: { url: '/avatar.jpg', alt: 'Grace Hopper portrait' },
        }}
      />,
    )
    expect(screen.getByRole('img', { name: 'Grace Hopper portrait' })).toBeInTheDocument()
  })
})
