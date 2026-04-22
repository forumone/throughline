import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MediaBlock } from './MediaBlock.js'

describe('MediaBlock', () => {
  it('renders an image with alt text', () => {
    render(
      <MediaBlock media={{ type: 'image', url: '/pic.jpg', alt: 'A picture' }} />,
    )
    expect(screen.getByRole('img', { name: 'A picture' })).toHaveAttribute('src', '/pic.jpg')
  })

  it('renders a caption inside a figcaption when provided', () => {
    render(
      <MediaBlock
        media={{ type: 'image', url: '/pic.jpg', alt: 'x' }}
        caption="Explanatory caption"
      />,
    )
    const caption = screen.getByText('Explanatory caption')
    expect(caption.tagName.toLowerCase()).toBe('figcaption')
  })

  it('renders a video element with aria-label and poster', () => {
    const { container } = render(
      <MediaBlock
        media={{ type: 'video', url: '/clip.mp4', poster: '/poster.jpg', ariaLabel: 'Intro' }}
      />,
    )
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('aria-label', 'Intro')
    expect(video).toHaveAttribute('poster', '/poster.jpg')
  })
})
