import type { Job, JobDefinition, JobHandler } from './types.js'

/**
 * Describe a job once, for any runner.
 *
 * ```ts
 * export const expireStaleApprovals = defineJob(
 *   { id: 'expire-stale-approvals', on: { cron: '0 2 * * *' }, concurrency: 1 },
 *   async ({ step }) => step.run('expire', () => expire(payload)),
 * )
 * ```
 *
 * Validates what a runner would otherwise reject at registration, or worse,
 * accept and misbehave on: an empty id, no trigger or two, an idempotency key
 * with no fields, a fractional retry count.
 */
export function defineJob<TData = unknown, TResult = unknown>(
  definition: JobDefinition,
  handler: JobHandler<TData, TResult>,
): Job<TData, TResult> {
  if (!definition.id || definition.id.trim() !== definition.id) {
    throw new Error(
      `A job needs a non-empty id with no surrounding spaces; got ${JSON.stringify(definition.id)}.`,
    )
  }
  const on = definition.on as { event?: unknown; cron?: unknown }
  const triggers = ['event', 'cron'].filter(
    (key) => typeof on[key as 'event' | 'cron'] === 'string',
  )
  if (triggers.length !== 1) {
    throw new Error(`Job "${definition.id}" needs exactly one of \`on.event\` or \`on.cron\`.`)
  }
  if (definition.idempotency && definition.idempotency.fields.length === 0) {
    throw new Error(`Job "${definition.id}" declares idempotency with no fields.`)
  }
  for (const [key, value] of [
    ['retries', definition.retries],
    ['concurrency', definition.concurrency],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error(
        `Job "${definition.id}" has ${key} ${String(value)}; it must be a whole number.`,
      )
    }
  }
  return Object.freeze({ ...definition, handler })
}
