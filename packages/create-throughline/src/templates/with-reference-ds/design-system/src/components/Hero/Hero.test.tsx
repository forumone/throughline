import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero } from './Hero.js'

describe('Hero', () => {
  it('renders the headline as h1', () => {
    render(<Hero headline="Big news" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Big news')
  })

  it('renders eyebrow, body, and both CTAs when provided', () => {
    render(
      <Hero
        eyebrow="Program"
        headline="Fellowship for climate researchers"
        body="A one-year program."
        cta={{ label: 'Apply', url: '/apply' }}
        secondaryCta={{ label: 'Eligibility', url: '/eligibility' }}
      />,
    )
    expect(screen.getByText('Program')).toBeInTheDocument()
    expect(screen.getByText('A one-year program.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Apply' })).toHaveAttribute('href', '/apply')
    expect(screen.getByRole('link', { name: 'Eligibility' })).toHaveAttribute(
      'href',
      '/eligibility',
    )
  })

  it('omits the media region unless variant is split', () => {
    const { container, rerender } = render(
      <Hero
        headline="Hi"
        media={{ url: '/img.jpg', alt: 'pic' }}
      />,
    )
    expect(container.querySelector('img')).toBeNull()

    rerender(
      <Hero
        headline="Hi"
        variant="split"
        media={{ url: '/img.jpg', alt: 'pic' }}
      />,
    )
    expect(container.querySelector('img')).not.toBeNull()
  })
})
