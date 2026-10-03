import { describe, expect, it } from 'vitest'
import { existStep } from './exist.js'
import { makeContext } from '../_test-helpers.js'

describe('existStep', () => {
  it('passes for a draft document', async () => {
    const result = await existStep(
      makeContext({ document: { id: 'p1', _status: 'draft', title: 'Hi' } }),
    )
    expect(result.pass).toBe(true)
  })

  it('fails when document is empty (treated as missing)', async () => {
    const result = await existStep(makeContext({ document: {} }))
    expect(result.pass).toBe(false)
    expect(result.code).toBe('not-found')
  })

  it('fails when document is published with no unpublished changes', async () => {
    const result = await existStep(
      makeContext({
        document: {
          _status: 'published',
          updatedAt: '2026-04-22T12:00:00.000Z',
          publishedAt: '2026-04-22T12:00:00.000Z',
        },
      }),
    )
    expect(result.pass).toBe(false)
    expect(result.code).toBe('already-published')
  })

  it('passes when document is published but has unpublished updates', async () => {
    const result = await existStep(
      makeContext({
        document: {
          _status: 'published',
          updatedAt: '2026-04-23T12:00:00.000Z',
          publishedAt: '2026-04-22T12:00:00.000Z',
        },
      }),
    )
    expect(result.pass).toBe(true)
  })
})
