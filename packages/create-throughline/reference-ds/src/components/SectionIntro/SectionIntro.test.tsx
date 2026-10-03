import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionIntro } from './SectionIntro.js'

describe('SectionIntro', () => {
  it('renders the headline as h2', () => {
    render(<SectionIntro headline="Our approach" />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Our approach')
  })

  it('renders eyebrow and body when provided', () => {
    render(
      <SectionIntro
        eyebrow="About"
        headline="How we work"
        body="We start with content."
      />,
    )
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('We start with content.')).toBeInTheDocument()
  })

  it('omits the body when not provided', () => {
    render(<SectionIntro headline="Plain" />)
    expect(screen.queryByText(/we start/i)).not.toBeInTheDocument()
  })
})
