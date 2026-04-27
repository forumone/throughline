import type { Payload } from 'payload'

export interface RateLimitArgs {
  payload: Payload
  formId: string
  ipHash: string
  limit: number
  /** Override the form-submissions slug; defaults to 'form-submissions'. */
  collectionSlug?: string
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  total: number
}

/**
 * Postgres-backed rate limiter. Counts form-submissions for a given
 * (form, ipHash) tuple in the past hour. Sufficient for Phase 1 traffic;
 * deployments with high-volume forms should swap in a Redis-backed
 * limiter via plugin options later (the public submit endpoint already
 * abstracts this behind a single function call).
 */
export async function checkRateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const result = await args.payload.find({
    collection: args.collectionSlug ?? 'form-submissions',
    where: {
      and: [
        { form: { equals: args.formId } },
        { ipHash: { equals: args.ipHash } },
        { createdAt: { greater_than_equal: oneHourAgo } },
      ],
    },
    limit: args.limit + 1,
  })

  return {
    ok: result.totalDocs < args.limit,
    remaining: Math.max(0, args.limit - result.totalDocs),
    total: result.totalDocs,
  }
}
