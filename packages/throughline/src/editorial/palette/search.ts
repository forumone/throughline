import type { CollectionSlug, Payload, PayloadRequest } from 'payload'
import { matchRank, PER_SOURCE, searchWhere, type SearchSource } from './sources.js'

/*
The palette's search, server-side: the same `searchWhere` per source the
palette's REST calls send, through the Local API, as the person asking. The
`search_content` MCP tool is this.
*/

export interface SearchHit {
  collection: string
  /** The collection's singular label. */
  label: string
  id: number | string
  title: string
  /** 0 exact, 1 prefix, 2 word start, 3 anywhere. */
  rank: number
}

export async function searchContent(
  payload: Payload,
  options: {
    sources: readonly SearchSource[]
    query: string
    user: PayloadRequest['user']
    perSource?: number
  },
): Promise<SearchHit[]> {
  const q = options.query.trim()
  if (q === '') return []
  const settled = await Promise.allSettled(
    options.sources.map(async (source) => {
      const { docs } = await payload.find({
        collection: source.slug as CollectionSlug,
        where: searchWhere(source, q),
        limit: options.perSource ?? PER_SOURCE,
        depth: 0,
        select: { [source.titleField]: true } as never,
        sort: '-updatedAt',
        ...(source.drafts ? { draft: true } : {}),
        overrideAccess: false,
        user: options.user,
      })
      const singular = payload.collections[source.slug as CollectionSlug]?.config.labels.singular
      return (docs as unknown as Record<string, unknown>[]).map((doc) => {
        const value = doc[source.titleField]
        const title = typeof value === 'string' && value !== '' ? value : 'Untitled'
        return {
          collection: source.slug,
          label: typeof singular === 'string' ? singular : source.slug,
          id: doc['id'] as number | string,
          title,
          rank: matchRank(title, q),
        }
      })
    }),
  )
  const hits: SearchHit[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') hits.push(...result.value)
    else payload.logger.warn({ err: result.reason }, 'Search: a collection did not answer.')
  }
  // Stable: best match first, source order within a rank, as the palette orders them.
  return hits.sort((a, b) => a.rank - b.rank)
}
