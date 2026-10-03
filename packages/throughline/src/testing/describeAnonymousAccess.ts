import { beforeAll, describe, expect, it } from 'vitest'
import {
  bucketSlugs,
  classificationFindings,
  privateProblem,
  renderPathProblem,
  type AccessCheckedConfig,
  type AccessCheckedEntity,
  type AnonymousAccessBuckets,
  type ConfigInput,
} from './anonymousAccess.js'

export interface DescribeAnonymousAccessOptions {
  /** The suite's name. Defaults to "anonymous access". */
  title?: string
}

/**
 * Registers a vitest suite asserting what an anonymous request may read.
 *
 * Call it at the top level of a test file with the site's `payload.config.ts`
 * and its bucket map:
 *
 * ```ts
 * import config from '../payload.config'
 * describeAnonymousAccess(config, {
 *   renderPath: { pages: 'the [...slug] route', media: 'every populated upload' },
 *   private: ['users', 'audit-events', 'payload-preferences'],
 * })
 * ```
 *
 * One test classifies every collection (and every global, when `globals` is
 * given) into exactly one bucket; then one test per entry checks the rule
 * itself, so a failure names the collection. No database: the config is
 * imported, never connected.
 */
export function describeAnonymousAccess(
  config: ConfigInput,
  buckets: AnonymousAccessBuckets,
  options: DescribeAnonymousAccessOptions = {},
): void {
  describe(options.title ?? 'anonymous access', () => {
    let resolved: AccessCheckedConfig

    beforeAll(async () => {
      // `buildConfig` is async, and awaiting it is the only way to see the
      // collections the plugins add on top of the site's own.
      resolved = await config
    })

    const find = (entity: 'collection' | 'global', slug: string): AccessCheckedEntity => {
      const items = (entity === 'collection' ? resolved.collections : resolved.globals) ?? []
      const item = items.find((candidate) => candidate.slug === slug)
      // Reported by the classification test as `not-in-config`; failing here
      // too keeps this entry's own result honest.
      expect(item, `${slug} is not in the config`).toBeDefined()
      return item as AccessCheckedEntity
    }

    const sides: Array<{
      entity: 'collection' | 'global'
      renderPath: Readonly<Record<string, string>>
      closed: Readonly<Record<string, string>> | readonly string[] | undefined
    }> = [{ entity: 'collection', renderPath: buckets.renderPath, closed: buckets.private }]
    if (buckets.globals) {
      sides.push({
        entity: 'global',
        renderPath: buckets.globals.renderPath ?? {},
        closed: buckets.globals.private,
      })
    }

    for (const side of sides) {
      const plural = `${side.entity}s`

      it(`puts every ${side.entity} in exactly one bucket`, () => {
        const items = (side.entity === 'collection' ? resolved.collections : resolved.globals) ?? []
        // A config with nothing in it makes every assertion below vacuous.
        expect(items.length, `the config has no ${plural}`).toBeGreaterThan(0)
        const findings = classificationFindings(
          side.entity,
          items,
          Object.keys(side.renderPath),
          bucketSlugs(side.closed),
        )
        expect(findings.map((finding) => finding.message)).toEqual([])
      })

      const renderEntries = Object.entries(side.renderPath)
      if (renderEntries.length > 0) {
        describe(`${plural} the render path reads`, () => {
          it.each(renderEntries)('%s — read by %s', async (slug) => {
            const problem = await renderPathProblem(find(side.entity, slug))
            expect(problem?.message).toBeUndefined()
          })
        })
      }

      const closedSlugs = bucketSlugs(side.closed)
      if (closedSlugs.length > 0) {
        describe(`${plural} the internet must not read`, () => {
          it.each(closedSlugs)('%s refuses an anonymous read', async (slug) => {
            const problem = await privateProblem(find(side.entity, slug))
            expect(problem?.message).toBeUndefined()
          })
        })
      }
    }
  })
}
