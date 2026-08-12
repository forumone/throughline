import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Divider } from './Divider.js'

describe('Divider', () => {
  it('renders a hr element', () => {
    const { container } = render(<Divider />)
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('defaults to aria-hidden for decorative use', () => {
    const { container } = render(<Divider />)
    expect(container.querySelector('hr')).toHaveAttribute('aria-hidden', 'true')
  })

  it('removes aria-hidden when not decorative', () => {
    const { container } = render(<Divider decorative={false} />)
    expect(container.querySelector('hr')).not.toHaveAttribute('aria-hidden')
  })
})
