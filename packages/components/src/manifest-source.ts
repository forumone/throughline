import type { Payload } from 'payload'
import {
  type LoadedManifest,
  loadManifest,
  loadManifestFromUrl,
} from '@forumone/throughline-design-contract'
import type { ManifestSource } from './options.js'

export interface ManifestLoader {
  /** Returns the cached manifest, refreshing if the URL TTL has expired. */
  get(): Promise<LoadedManifest>
  /** Forces a re-fetch from the source. */
  refresh(): Promise<LoadedManifest>
}

/**
 * Builds a manifest loader from a source descriptor. The loader caches the
 * parsed manifest indefinitely for `object` and `payload-collection` sources;
 * for `url` sources it honors `refreshInterval` (seconds) and re-fetches when
 * the cached copy is older than that.
 */
export function createManifestLoader(source: ManifestSource, payload: Payload): ManifestLoader {
  let cached: LoadedManifest | null = null
  let lastLoadedAt = 0

  async function load(): Promise<LoadedManifest> {
    switch (source.type) {
      case 'object':
        return loadManifest(source.manifest)
      case 'url':
        return loadManifestFromUrl(source.url)
      case 'payload-collection': {
        const where = source.documentId
          ? { id: { equals: source.documentId } }
          : undefined
        const result = await payload.find({
          collection: source.slug,
          ...(where ? { where } : {}),
          limit: 1,
          sort: '-updatedAt',
        })
        const doc = result.docs[0] as Record<string, unknown> | undefined
        if (!doc) {
          const idClause = source.documentId ? ` with id "${source.documentId}"` : ''
          throw new Error(
            `No manifest document found in collection "${source.slug}"${idClause}`,
          )
        }
        const candidate = (doc['data'] ?? doc) as unknown
        return loadManifest(candidate)
      }
    }
  }

  return {
    async get() {
      if (cached) {
        if (source.type === 'url' && source.refreshInterval !== undefined) {
          const ageMs = Date.now() - lastLoadedAt
          if (ageMs > source.refreshInterval * 1000) {
            cached = await load()
            lastLoadedAt = Date.now()
          }
        }
        return cached
      }
      cached = await load()
      lastLoadedAt = Date.now()
      return cached
    },
    async refresh() {
      cached = await load()
      lastLoadedAt = Date.now()
      return cached
    },
  }
}
