import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { McpMetaSchema, withMeta } from './meta.js'

describe('McpMetaSchema', () => {
  it('accepts undefined', () => {
    expect(McpMetaSchema.safeParse(undefined).success).toBe(true)
  })

  it('accepts an empty object', () => {
    expect(McpMetaSchema.safeParse({}).success).toBe(true)
  })

  it('parses a complete meta payload', () => {
    const result = McpMetaSchema.safeParse({
      userPrompt: 'Publish the homepage',
      reasoning: 'Owner approved in Slack',
      changesSummary: 'Updated headline copy',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-string fields', () => {
    expect(McpMetaSchema.safeParse({ userPrompt: 42 }).success).toBe(false)
  })
})

describe('withMeta', () => {
  it('adds an optional _meta field to the schema', () => {
    const schema = withMeta({ pageId: z.string() })
    expect(schema.safeParse({ pageId: 'p1' }).success).toBe(true)
    expect(
      schema.safeParse({ pageId: 'p1', _meta: { userPrompt: 'do it' } }).success,
    ).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })
})
