import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card.js'

describe('Card', () => {
  it('renders as a link when a link target is provided', () => {
    render(
      <Card
        title="Linked"
        description="desc"
        link={{ label: 'Read', url: '/read' }}
      />,
    )
    const link = screen.getByRole('link', { name: /linked/i })
    expect(link).toHaveAttribute('href', '/read')
  })

  it('renders as an article without link', () => {
    const { container } = render(<Card title="Static" description="plain" />)
    const root = container.firstChild as HTMLElement
    expect(root.tagName.toLowerCase()).toBe('article')
  })

  it('renders image, eyebrow, and description when provided', () => {
    render(
      <Card
        eyebrow="Program"
        image={{ url: '/img.jpg', alt: 'Illustration' }}
        title="Hello"
        description="Some text"
      />,
    )
    expect(screen.getByText('Program')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Illustration' })).toBeInTheDocument()
    expect(screen.getByText('Some text')).toBeInTheDocument()
  })
})
