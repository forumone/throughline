import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { checkRateLimit } from './rate-limit.js'

interface FindArgs {
  collection: string
  where?: { and?: Array<Record<string, Record<string, unknown>>> }
  limit?: number
}

function fakePayload(totalDocs: number): { payload: Payload; finds: FindArgs[] } {
  const finds: FindArgs[] = []
  const payload = {
    find: async (args: FindArgs) => {
      finds.push(args)
      return { docs: [], totalDocs, page: 1, totalPages: 1, limit: args.limit ?? 0, hasNextPage: false, hasPrevPage: false, nextPage: null, prevPage: null, pagingCounter: 1 }
    },
  } as unknown as Payload
  return { payload, finds }
}

describe('checkRateLimit', () => {
  it('returns ok when under the limit', async () => {
    const { payload } = fakePayload(2)
    const result = await checkRateLimit({ payload, formId: 'f-1', ipHash: 'h', limit: 5 })
    expect(result).toEqual({ ok: true, remaining: 3, total: 2 })
  })

  it('returns not ok when at the limit', async () => {
    const { payload } = fakePayload(5)
    const result = await checkRateLimit({ payload, formId: 'f-1', ipHash: 'h', limit: 5 })
    expect(result.ok).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('uses the configured collection slug', async () => {
    const { payload, finds } = fakePayload(0)
    await checkRateLimit({
      payload,
      formId: 'f-1',
      ipHash: 'h',
      limit: 5,
      collectionSlug: 'custom-submissions',
    })
    expect(finds[0]?.collection).toBe('custom-submissions')
  })

  it('queries form + ipHash + 1-hour window', async () => {
    const { payload, finds } = fakePayload(0)
    await checkRateLimit({ payload, formId: 'f-1', ipHash: 'h', limit: 5 })
    const conditions = finds[0]?.where?.and ?? []
    expect(conditions).toContainEqual({ form: { equals: 'f-1' } })
    expect(conditions).toContainEqual({ ipHash: { equals: 'h' } })
    const dateCondition = conditions.find((c) => 'createdAt' in c)
    expect(dateCondition).toBeDefined()
  })
})
