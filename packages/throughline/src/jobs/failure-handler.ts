import type { Payload } from 'payload'
import type { Logger } from '../plugin-contract/index.js'
import {
  buildHealthcheckFailureReport,
  buildJobFailureReport,
  reportError,
  summariseReport,
  type ErrorReporter,
  type HealthcheckFailureReport,
  type JobFailureReport,
} from '../observability/report.js'
import { getJobFailureWriter } from '../observability/plugin.js'
import { type JobFailureWriter } from '../observability/writer.js'
import { defaultLogger } from '../logger/index.js'
import type { HealthcheckOptions, WorkflowFailureHandler } from './workflow-types.js'

/*
The handler `failureOptions` was missing.

`onTerminalFailure` has been accepted by every factory here since audit 06 F-09,
and it did nothing unless a host wrote one — so every host wrote its own, or
none. This is the default worth having: one failure goes to three places, each
of which works without the others.

1. **The log**, first and unconditionally. It is the only one that needs no
   configuration, so it is the one that survives everything else being unset.
2. **The `job-failures` collection**, when `jobFailuresPlugin` is registered —
   a row an admin can find later, after the log has rotated.
3. **The error reporter** — by default `ERROR_WEBHOOK_URL`, which is the only
   one of the three that tells somebody without them having to go and look.

None of them can throw, and the handler cannot either. An Inngest `onFailure`
handler is itself a function run: a throw is retried by the platform, which
turns one incident into a retry storm about the reporter while the original
failure is what nobody sees.
*/

export interface FailureHandlerOptions {
  /**
   * The Payload instance whose `jobFailuresPlugin` writer receives the row.
   * Without one — or without the plugin — the failure is logged and reported
   * but not recorded.
   */
  payload?: Payload | undefined
  /** Replaces the writer found on `payload`. */
  writer?: JobFailureWriter | undefined
  /** Default: `reportError` from core, which posts to `ERROR_WEBHOOK_URL`. Pass `false` to not report. */
  report?: ErrorReporter | false | undefined
  /** Default: core's console logger. */
  logger?: Logger | undefined
}

export interface HealthcheckFailureHandlerOptions extends FailureHandlerOptions {
  /** The healthcheck function's id, recorded as the failure's source. Default: `'healthcheck'`. */
  functionId?: string | undefined
}

/**
 * An `onTerminalFailure` handler for any workflow factory here — or for any
 * Inngest function, as its `onFailure`.
 *
 * ```ts
 * const onTerminalFailure = createTerminalFailureHandler({ payload })
 * inngestJobs(inngest, { payload, onFailure: onTerminalFailure })
 * ```
 */
export function createTerminalFailureHandler(
  options: FailureHandlerOptions = {},
): WorkflowFailureHandler {
  return async ({ error, event }) => {
    let report: JobFailureReport
    try {
      const data = event?.data
      report = buildJobFailureReport({
        functionId: data?.function_id,
        runId: data?.run_id,
        triggerEvent: data?.event?.name,
        error,
      })
    } catch {
      return
    }
    await dispatch(report, '[job-failed]', options)
  }
}

/**
 * A `HealthcheckOptions.onFailure` handler: once per run with failing checks,
 * to the same three places.
 */
export function createHealthcheckFailureHandler(
  options: HealthcheckFailureHandlerOptions = {},
): NonNullable<HealthcheckOptions['onFailure']> {
  return async (failures, context) => {
    let report: HealthcheckFailureReport
    try {
      report = buildHealthcheckFailureReport(
        failures,
        options.functionId ? { functionId: options.functionId } : {},
      )
    } catch {
      return
    }
    // The run's own Payload, when the handler was made without one: what lets
    // it be declared with the job, before Payload exists, and still write its row.
    const payload = options.payload ?? context?.payload
    await dispatch(report, '[healthcheck-failed]', payload ? { ...options, payload } : options)
  }
}

async function dispatch(
  report: JobFailureReport | HealthcheckFailureReport,
  tag: string,
  options: FailureHandlerOptions,
): Promise<void> {
  const logger = options.logger ?? defaultLogger
  try {
    // The stack goes to the log and the webhook; the row keeps the message.
    logger.error(`${tag} ${summariseReport(report)}`, { report })
  } catch {
    // Carry on to the other two.
  }

  const writer =
    options.writer ?? (options.payload ? getJobFailureWriter(options.payload) : undefined)
  const reporter = options.report === false ? undefined : (options.report ?? reportError)

  // Core's writer and reporter never reject. These wrappers are for a host's
  // own, which may not keep that promise — or may throw before returning one.
  await Promise.allSettled([(async () => writer?.(report))(), (async () => reporter?.(report))()])
}
