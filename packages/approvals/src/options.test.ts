import { afterEach, describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import { validateOptions } from './options.js'

const fakeInngest = {} as Inngest
const fakeResolver = { resolveUsers: async () => [] }

describe('validateOptions', () => {
  const originalEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('accepts a minimal valid config and returns the resolved tokenSecret', () => {
    const result = validateOptions({
      groups: [{ slug: 'editorial', name: 'Editorial' }],
      groupResolver: fakeResolver,
      inngest: fakeInngest,
      tokenSecret: 'a'.repeat(32),
    })
    expect(result.tokenSecret.length).toBe(32)
  })

  it('falls back to APPROVAL_TOKEN_SECRET env when not in options', () => {
    process.env['APPROVAL_TOKEN_SECRET'] = 'b'.repeat(40)
    const result = validateOptions({
      groups: [{ slug: 'editorial', name: 'Editorial' }],
      groupResolver: fakeResolver,
      inngest: fakeInngest,
    })
    expect(result.tokenSecret.length).toBe(40)
  })

  it('throws when no groups are configured', () => {
    expect(() =>
      validateOptions({
        groups: [],
        groupResolver: fakeResolver,
        inngest: fakeInngest,
        tokenSecret: 'a'.repeat(32),
      }),
    ).toThrow(/at least one group/)
  })

  it('throws when groupResolver is missing', () => {
    expect(() =>
      validateOptions({
        groups: [{ slug: 'editorial', name: 'Editorial' }],
        inngest: fakeInngest,
        tokenSecret: 'a'.repeat(32),
      } as never),
    ).toThrow(/groupResolver/)
  })

  it('throws when inngest is missing', () => {
    expect(() =>
      validateOptions({
        groups: [{ slug: 'editorial', name: 'Editorial' }],
        groupResolver: fakeResolver,
        tokenSecret: 'a'.repeat(32),
      } as never),
    ).toThrow(/Inngest/)
  })

  it('throws when token secret is too short', () => {
    delete process.env['APPROVAL_TOKEN_SECRET']
    expect(() =>
      validateOptions({
        groups: [{ slug: 'editorial', name: 'Editorial' }],
        groupResolver: fakeResolver,
        inngest: fakeInngest,
        tokenSecret: 'short',
      }),
    ).toThrow(/32\+ characters/)
  })

  it('throws on duplicate group slugs', () => {
    expect(() =>
      validateOptions({
        groups: [
          { slug: 'legal', name: 'Legal' },
          { slug: 'legal', name: 'Legal again' },
        ],
        groupResolver: fakeResolver,
        inngest: fakeInngest,
        tokenSecret: 'a'.repeat(32),
      }),
    ).toThrow(/duplicate group slug/)
  })
})
