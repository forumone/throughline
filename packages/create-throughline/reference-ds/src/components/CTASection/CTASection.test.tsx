import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CTASection } from './CTASection.js'

describe('CTASection', () => {
  it('renders headline as h2 and primary CTA', () => {
    render(
      <CTASection
        headline="Act now"
        cta={{ label: 'Start', url: '/start' }}
      />,
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Act now')
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute('href', '/start')
  })

  it('renders secondary CTA when provided', () => {
    render(
      <CTASection
        headline="Act now"
        cta={{ label: 'Start', url: '/start' }}
        secondaryCta={{ label: 'Learn more', url: '/learn' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Learn more' })).toBeInTheDocument()
  })
})
