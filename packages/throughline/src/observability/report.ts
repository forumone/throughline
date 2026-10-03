import type { Logger } from '../plugin-contract/index.js'
import { defaultLogger } from '../logger/index.js'

/*
What an error looks like when it leaves the application, and how it leaves.

Provider-agnostic on purpose. Which error tracker a site pays for is the site's
decision, so this defines the *shape* of a report and posts it to whatever URL
it is given — a log drain, an alerting endpoint, a Slack incoming webhook, a
small proxy in front of Sentry. Swapping in an SDK later replaces the reporter
and nothing that builds reports.

Three rules hold everywhere in this file:

- **Nothing here throws.** A reporter runs because something already went
  wrong. One that throws turns a handled error into an unhandled one, and in an
  Inngest `onFailure` handler it puts the run back in the retry queue for a
  reason that has nothing to do with the original fault.
- **Request headers are an allowlist.** Next's `onRequestError` hands over the
  request's headers entire, and those include `cookie` — on an admin's request,
  a live Payload session. A report that copied headers wholesale would post a
  credential to a third party. A handful of headers that are never secret are
  copied, and a short list that always is a credential can never be copied,
  whatever a caller passes.
- **Every report has a `text`.** Slack's incoming webhooks refuse a body
  without one, and a delivery failure is swallowed here by design — so a Slack
  URL without it would read as configured and deliver nothing. Other receivers
  ignore the extra key.
*/

/** Request headers copied into a report unless the caller names its own list. */
export const DEFAULT_REPORTED_HEADERS: readonly string[] = [
  'x-request-id',
  'x-vercel-id',
  'user-agent',
  'referer',
]

/**
 * Headers that are never copied, even when a caller lists them. Each one is,
 * or routinely carries, a credential. `x-forwarded-for` is here too: the whole
 * address is personal data, and a report carries only its prefix.
 */
export const NEVER_REPORTED_HEADERS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-forwarded-for',
]

/** The environment variable the default reporter reads. */
export const ERROR_WEBHOOK_URL_ENV = 'ERROR_WEBHOOK_URL'

const DEFAULT_TIMEOUT_MS = 3_000

/** Which deployment produced a report, so it is attributable after a rollback. */
export interface ReportDeployment {
  environment?: string
  commit?: string
}

/** An unhandled error in a request, as `instrumentation.ts` sees one. */
export interface RequestErrorReport {
  kind: 'request'
  /** ISO 8601, so a report is orderable without trusting the receiver's clock. */
  at: string
  message: string
  name?: string
  stack?: string
  /** React's error digest — the only handle on a minified Server Component error. */
  digest?: string
  request: {
    path: string
    method: string
    /** The allowlisted headers that were present, lower-cased. */
    headers: Record<string, string>
    /** The client address reduced to a /16 (IPv4) or /64 (IPv6). */
    clientPrefix?: string
  }
  context: {
    routePath?: string
    routeType?: string
    renderSource?: string
    revalidateReason?: string
  }
  deployment: ReportDeployment
}

/** A background job that ran out of retries. */
export interface JobFailureReport {
  kind: 'job'
  at: string
  /** The function that failed, e.g. an Inngest function id. `'unknown'` if nothing named it. */
  functionId: string
  /** The run's id — the handle for finding it in the job runner's dashboard. */
  runId?: string
  /** The event that triggered the run, so a failure is traceable to a cause. */
  triggerEvent?: string
  message: string
  name?: string
  stack?: string
  deployment: ReportDeployment
}

/** A healthcheck run in which at least one check failed. */
export interface HealthcheckFailureReport {
  kind: 'healthcheck'
  at: string
  functionId: string
  failed: Array<{ name: string; details?: string }>
  deployment: ReportDeployment
}

export type ErrorReport = RequestErrorReport | JobFailureReport | HealthcheckFailureReport

/** Request headers as Next hands them over, or a Fetch `Headers`. */
export type ReportableHeaders =
  Record<string, string | string[] | undefined> | { get(name: string): string | null }

export interface BuildRequestErrorReportOptions {
  /** Headers to copy. Default: {@link DEFAULT_REPORTED_HEADERS}. {@link NEVER_REPORTED_HEADERS} are dropped regardless. */
  headers?: readonly string[]
  /** Default: read from the environment — see {@link currentDeployment}. */
  deployment?: ReportDeployment
  now?: Date
}

/**
 * The deployment a report came from, read from the environment.
 *
 * `VERCEL_ENV` before `NODE_ENV`, because on Vercel a preview deployment is
 * `NODE_ENV=production` too, and "production or somebody's branch" is the
 * first question about an alert. Off Vercel, `NODE_ENV` is what there is.
 */
export function currentDeployment(env: NodeJS.ProcessEnv = process.env): ReportDeployment {
  const environment = nonEmpty(env['VERCEL_ENV']) ?? nonEmpty(env['NODE_ENV'])
  const commit = nonEmpty(env['VERCEL_GIT_COMMIT_SHA'])
  return {
    ...(environment ? { environment } : {}),
    ...(commit ? { commit: commit.slice(0, 12) } : {}),
  }
}

/**
 * An IPv4 or IPv6 address reduced to a prefix: enough to tell one host's burst
 * from many readers hitting the same fault, and not enough to identify anyone.
 * `x-forwarded-for` may carry a list; only the first entry is the client.
 */
export function clientPrefix(forwardedFor: string | undefined): string | undefined {
  if (!forwardedFor) return undefined
  const first = forwardedFor.split(',')[0]?.trim()
  if (!first) return undefined

  if (first.includes(':')) {
    const groups = first.split(':').filter(Boolean).slice(0, 4)
    return groups.length > 0 ? `${groups.join(':')}::/64` : undefined
  }

  const octets = first.split('.')
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.0.0/16` : undefined
}

/**
 * Build a report for an error captured during a request. Pure, so the
 * redaction is testable without a server.
 *
 * `error` is `unknown` because Next types it that way and means it: the value
 * reaching `onRequestError` may have been processed by React rather than being
 * the instance that was thrown, which is why `digest` is read separately.
 */
export function buildRequestErrorReport(
  error: unknown,
  request: { path: string; method: string; headers: ReportableHeaders },
  context: object = {},
  options: BuildRequestErrorReportOptions = {},
): RequestErrorReport {
  const prefix = clientPrefix(headerValue(request.headers, 'x-forwarded-for'))

  const headers: Record<string, string> = {}
  for (const name of allowedHeaders(options.headers)) {
    const value = headerValue(request.headers, name)
    if (value) headers[name] = value
  }

  const routeContext: RequestErrorReport['context'] = {}
  for (const key of ['routePath', 'routeType', 'renderSource', 'revalidateReason'] as const) {
    const value = (context as Record<string, unknown>)[key]
    if (typeof value === 'string') routeContext[key] = value
  }

  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : undefined

  return {
    kind: 'request',
    at: (options.now ?? new Date()).toISOString(),
    ...describeError(error),
    ...(digest ? { digest } : {}),
    request: {
      path: request.path,
      method: request.method,
      headers,
      ...(prefix ? { clientPrefix: prefix } : {}),
    },
    context: routeContext,
    deployment: options.deployment ?? currentDeployment(),
  }
}

export interface BuildJobFailureReportInput {
  /** The failing function. Omitted or empty is reported as `'unknown'` rather than dropped. */
  functionId?: string | undefined
  runId?: string | undefined
  triggerEvent?: string | undefined
  error: unknown
}

/**
 * Build a report for a job that ran out of retries.
 *
 * The stack is included: this goes to a webhook the team owns, where a stack
 * is the most useful field in it. The job-failures collection, which admins
 * read through the CMS, stores the message and not the stack.
 */
export function buildJobFailureReport(
  input: BuildJobFailureReportInput,
  options: { deployment?: ReportDeployment; now?: Date } = {},
): JobFailureReport {
  return {
    kind: 'job',
    at: (options.now ?? new Date()).toISOString(),
    functionId: nonEmpty(input.functionId) ?? 'unknown',
    ...(nonEmpty(input.runId) ? { runId: input.runId as string } : {}),
    ...(nonEmpty(input.triggerEvent) ? { triggerEvent: input.triggerEvent as string } : {}),
    ...describeError(input.error),
    deployment: options.deployment ?? currentDeployment(),
  }
}

/** Build a report for a healthcheck run with failing checks. */
export function buildHealthcheckFailureReport(
  failures: ReadonlyArray<{ name: string; details?: string | undefined }>,
  options: { functionId?: string; deployment?: ReportDeployment; now?: Date } = {},
): HealthcheckFailureReport {
  return {
    kind: 'healthcheck',
    at: (options.now ?? new Date()).toISOString(),
    functionId: options.functionId ?? 'healthcheck',
    failed: failures.map((failure) => ({
      name: failure.name,
      ...(failure.details ? { details: failure.details } : {}),
    })),
    deployment: options.deployment ?? currentDeployment(),
  }
}

/**
 * One line describing a report, for a receiver that renders rather than
 * indexes. Reads the report structurally, so a site's own report shapes get a
 * sensible line too.
 */
export function summariseReport(report: unknown): string {
  const row = (typeof report === 'object' && report !== null ? report : {}) as Record<
    string,
    unknown
  >
  const deployment = (row['deployment'] ?? {}) as Record<string, unknown>
  const environment = nonEmpty(deployment['environment']) ?? 'unknown environment'
  const kind = nonEmpty(row['kind']) ?? 'error'

  const failed = Array.isArray(row['failed'])
    ? (row['failed'] as Array<{ name?: unknown }>).map((f) => String(f.name)).join(', ')
    : undefined
  const headline =
    nonEmpty(row['message']) ?? (failed ? `failing: ${failed}` : undefined) ?? 'no message'

  const request = (row['request'] ?? {}) as Record<string, unknown>
  const path = nonEmpty(request['path'])
  const where =
    nonEmpty(row['functionId']) ??
    (path ? `${nonEmpty(request['method']) ?? 'GET'} ${path}` : undefined)

  return `[${environment}] ${kind}: ${headline}${where ? ` — ${where}` : ''}`
}

/**
 * Whether reports go anywhere, as a sentence for a boot-time log line. A
 * sentence rather than a boolean because "off because this is a laptop" and
 * "off because somebody forgot in production" look identical otherwise.
 */
export function describeErrorReporting(url: string | undefined = readWebhookUrl()): string {
  if (!url || url.trim() === '') {
    return `error reporting: OFF (${ERROR_WEBHOOK_URL_ENV} unset) — errors reach the log only`
  }
  try {
    return `error reporting: on, to ${new URL(url).host}`
  } catch {
    return `error reporting: MISCONFIGURED (${ERROR_WEBHOOK_URL_ENV} is not a URL) — errors reach the log only`
  }
}

export interface ErrorReporterOptions {
  /**
   * Where to POST. Default: `process.env.ERROR_WEBHOOK_URL`, read on every
   * call so a reporter built before the environment loads still finds it.
   * Unset or empty means reports are not delivered.
   */
  url?: string | undefined
  /** Extra headers sent *to the webhook*, e.g. an `authorization` the receiver expects. */
  webhookHeaders?: Record<string, string>
  /** Abort the POST after this long. Default: 3000ms — shorter than any function timeout. */
  timeoutMs?: number
  /** Where a failed delivery is logged. Default: the console logger. */
  logger?: Logger
  /** Injected for tests. Default: the global `fetch`. */
  fetch?: typeof fetch
}

/** Posts a report. Never throws, never rejects. */
export type ErrorReporter = (report: unknown) => Promise<void>

/**
 * A reporter that POSTs each report as JSON, with a `text` summary added.
 *
 * A delivery that fails — a refused connection, a timeout, a non-2xx — is
 * logged as a warning and otherwise swallowed. It is never rethrown: see the
 * note at the top of this file.
 */
export function createErrorReporter(options: ErrorReporterOptions = {}): ErrorReporter {
  const logger = options.logger ?? defaultLogger
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return async function deliver(report: unknown): Promise<void> {
    try {
      const url = (options.url ?? readWebhookUrl())?.trim()
      if (!url) return

      const text = summariseReport(report)
      // A non-object report is still delivered, wrapped, rather than dropped.
      const body =
        typeof report === 'object' && report !== null
          ? { text, ...(report as Record<string, unknown>) }
          : { text, report }

      const doFetch = options.fetch ?? fetch
      const response = await doFetch(url, {
        method: 'POST',
        headers: { ...options.webhookHeaders, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        // A serverless function may be frozen once its response is sent; a
        // report that has not left by then never does.
        keepalive: true,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        logger.warn('Error report was not accepted', { status: response.status, summary: text })
      }
    } catch (deliveryError) {
      try {
        logger.warn('Error report delivery failed', { error: String(deliveryError) })
      } catch {
        // A logger that throws is the last thing that can go wrong here.
      }
    }
  }
}

/** The default reporter: `ERROR_WEBHOOK_URL`, a 3s timeout, the console logger. */
export const reportError: ErrorReporter = createErrorReporter()

function readWebhookUrl(): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[ERROR_WEBHOOK_URL_ENV]
}

function allowedHeaders(requested: readonly string[] | undefined): string[] {
  const never = new Set(NEVER_REPORTED_HEADERS)
  return (requested ?? DEFAULT_REPORTED_HEADERS)
    .map((name) => name.toLowerCase())
    .filter((name) => !never.has(name))
}

function headerValue(headers: ReportableHeaders, name: string): string | undefined {
  let raw: unknown
  if (typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get(name: string): string | null }).get(name)
  } else {
    const record = headers as Record<string, string | string[] | undefined>
    raw = record[name] ?? Object.entries(record).find(([key]) => key.toLowerCase() === name)?.[1]
  }
  const value = Array.isArray(raw) ? raw[0] : raw
  return nonEmpty(value)
}

function describeError(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || String(error),
      ...(error.name ? { name: error.name } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return { message: String((error as { message: unknown }).message) }
  }
  return { message: String(error) }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
