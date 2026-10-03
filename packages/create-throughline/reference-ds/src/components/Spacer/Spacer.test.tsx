import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spacer } from './Spacer.js'

describe('Spacer', () => {
  it('is aria-hidden and presentational', () => {
    const { container } = render(<Spacer />)
    const spacer = container.firstChild as HTMLElement
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
    expect(spacer).toHaveAttribute('role', 'presentation')
  })

  it('applies the size modifier class', () => {
    const { container } = render(<Spacer size="lg" />)
    expect((container.firstChild as HTMLElement).className).toContain('lg')
  })
})
