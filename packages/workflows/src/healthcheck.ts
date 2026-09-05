import { failureOptions } from './types.js'
import type { InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { HealthcheckDefinition, HealthcheckOptions, HealthcheckResult } from './types.js'

const DEFAULT_SCHEDULE = '*/15 * * * *'
const REACHABLE_TIMEOUT_MS = 5_000

/**
 * Cron healthcheck. Runs every check in its own `step.run` so one
 * misbehaving probe can't take down the rest, collects failures, and
 * routes them to `onFailure` (defaults to `console.error`). Always fires
 * a `system/healthcheck` Inngest event so external dashboards can
 * observe heartbeats independently of failure routing.
 */
export function createHealthcheckFunction(options: HealthcheckOptions): InngestFunction.Any {
  const schedule = options.schedule ?? DEFAULT_SCHEDULE
  const onFailure = options.onFailure ?? defaultOnFailure

  return options.inngest.createFunction(
    {
      id: options.id ?? 'healthcheck',
      /*
      One at a time by default. Two probes running together tell you nothing a
      single one does not, and `onFailure` below fires per run — so overlapping
      runs would report the same outage twice.

      `HealthcheckOptions.onFailure` is this package's own option and a
      different thing from Inngest's: it is called once per run when a check
      fails, so it reports the *first* bad run rather than waiting for retries
      to exhaust. A probe has no retries. Both are available now, and they
      answer different questions — see the note on `failureOptions`.
      */
      ...failureOptions(options, 1),
      triggers: [{ cron: schedule }],
    },
    async ({ step, logger }) => {
      const results: Array<{ name: string; ok: boolean; details?: string }> = []

      for (const check of options.checks) {
        const outcome = await step.run(`check-${check.name}`, async () => {
          try {
            const result = await check.run({ payload: options.payload })
            return { name: check.name, ...result }
          } catch (error) {
            return {
              name: check.name,
              ok: false,
              details: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })
        results.push(outcome)
      }

      const failures = results
        .filter((r) => !r.ok)
        .map((r) => {
          const entry: { name: string; details?: string } = { name: r.name }
          if (r.details) entry.details = r.details
          return entry
        })

      if (failures.length > 0) {
        await step.run('report-failures', async () => {
          await onFailure(failures)
        })
      }

      await step.run('emit-heartbeat', async () => {
        await options.inngest.send({
          name: 'system/healthcheck',
          data: {
            source: 'workflow',
            timestamp: new Date().toISOString(),
          },
        })
      })

      logger.info('Healthcheck complete', {
        totalChecks: results.length,
        failures: failures.length,
      })

      return { results, failureCount: failures.length }
    },
  )
}

async function defaultOnFailure(failures: Array<{ name: string; details?: string }>): Promise<void> {
  // eslint-disable-next-line no-console
  console.error(
    `[healthcheck] ${failures.length} check(s) failed: ${failures
      .map((f) => `${f.name}: ${f.details ?? 'no details'}`)
      .join('; ')}`,
  )
}

/**
 * Check that Payload is reachable and able to query a collection. Defaults
 * to `users` because every Payload deployment has it; pass a different
 * slug if `users` isn't always present (rare).
 */
export function createPayloadReachableCheck(
  collectionSlug: string = 'users',
): HealthcheckDefinition {
  return {
    name: 'payload-reachable',
    run: async ({ payload }: { payload: Payload }): Promise<HealthcheckResult> => {
      try {
        await payload.find({ collection: collectionSlug, limit: 1 })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
  }
}

/**
 * Check that a manifest URL is reachable. Aimed at the design-system
 * manifest the components server consults, but works for any HTTPS
 * endpoint that responds 2xx to a GET.
 */
export function createManifestReachableCheck(manifestUrl: string): HealthcheckDefinition {
  return {
    name: 'manifest-reachable',
    run: async (): Promise<HealthcheckResult> => {
      try {
        const response = await fetch(manifestUrl, {
          signal: AbortSignal.timeout(REACHABLE_TIMEOUT_MS),
        })
        if (response.ok) return { ok: true }
        return { ok: false, details: `HTTP ${response.status}` }
      } catch (error) {
        return {
          ok: false,
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
  }
}
