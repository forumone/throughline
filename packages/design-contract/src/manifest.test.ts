import { describe, it, expect } from 'vitest'
import { ManifestSchema } from './manifest.js'
import { makeManifest } from './_fixtures.js'

describe('ManifestSchema', () => {
  it('validates a complete manifest', () => {
    const result = ManifestSchema.safeParse(makeManifest())
    expect(result.success).toBe(true)
  })

  it('rejects a mismatched contractVersion', () => {
    const result = ManifestSchema.safeParse(makeManifest({ contractVersion: '2.0.0' as never }))
    expect(result.success).toBe(false)
  })

  it('rejects an invalid homepage URL', () => {
    const result = ManifestSchema.safeParse(
      makeManifest({
        designSystem: { name: 'x', version: '0.0.1', homepage: 'not-a-url' },
      }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects non-datetime build.timestamp', () => {
    const result = ManifestSchema.safeParse(
      makeManifest({ build: { timestamp: 'yesterday' } }),
    )
    expect(result.success).toBe(false)
  })
})
