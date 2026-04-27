import { describe, expect, it } from 'vitest'
import { accessibilityStep } from './accessibility.js'
import { makeContext } from '../_test-helpers.js'

describe('accessibilityStep', () => {
  it('passes a clean document', async () => {
    const result = await accessibilityStep(
      makeContext({
        document: {
          layout: [
            {
              blockType: 'hero',
              image: { filename: 'h.jpg', alt: 'A hero shot' },
              cta: { url: 'https://example.com', label: 'Learn more' },
            },
          ],
        },
      }),
    )
    expect(result.pass).toBe(true)
  })

  it('fails on missing alt text', async () => {
    const result = await accessibilityStep(
      makeContext({ document: { hero: { image: { filename: 'h.jpg' } } } }),
    )
    expect(result.pass).toBe(false)
    expect(result.code).toBe('accessibility-errors')
    expect(result.issues?.some((i) => i.rule === 'alt-text')).toBe(true)
  })

  it('fails on multiple Heroes', async () => {
    const result = await accessibilityStep(
      makeContext({
        document: { layout: [{ blockType: 'hero' }, { blockType: 'hero' }] },
      }),
    )
    expect(result.pass).toBe(false)
    expect(result.issues?.some((i) => i.rule === 'heading-hierarchy')).toBe(true)
  })

  it('fails on link without label', async () => {
    const result = await accessibilityStep(
      makeContext({ document: { cta: { url: 'https://example.com', label: '' } } }),
    )
    expect(result.pass).toBe(false)
    expect(result.issues?.some((i) => i.rule === 'link-labels')).toBe(true)
  })

  it('runs user-supplied checks alongside the built-ins', async () => {
    const ctx = makeContext({
      options: {
        collections: [{ slug: 'pages' }],
        inngest: makeContext().inngest,
        accessibilityChecks: [
          {
            name: 'custom',
            run: () => [
              { field: 'custom', message: 'Custom check failure', severity: 'error' as const },
            ],
          },
        ],
      },
      document: {},
    })
    const result = await accessibilityStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.issues?.some((i) => i.rule === 'custom')).toBe(true)
  })
})
