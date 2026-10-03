import { describe, expect, it } from 'vitest'
import { Inngest } from 'inngest'
import { createInngestClient } from './inngest.js'

describe('createInngestClient', () => {
  it('returns an Inngest instance', () => {
    const client = createInngestClient({ id: 'test-app', eventKey: 'test-key', isDev: true })
    expect(client).toBeInstanceOf(Inngest)
  })

  it('passes through the configured id', () => {
    const client = createInngestClient({ id: 'my-id', eventKey: 'k', isDev: true })
    // Inngest stores the id internally; we expose it via the readonly property.
    expect((client as unknown as { id: string }).id).toBe('my-id')
  })
})
