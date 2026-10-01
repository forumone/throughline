import type { Instrumentation } from 'next'
import {
  buildRequestErrorReport,
  describeErrorReporting,
  reportError,
} from '@forumone/throughline-core/observability'

/*
Where a server-side error goes.

`onRequestError` fires when Next captures an error in a Server Component
render, a Route Handler, a Server Action or the proxy — the one place that sees
all four. It does not see client-side errors; `error.tsx` and
`global-error.tsx` are the boundaries for those.

The report is logged first, always, and then posted to `ERROR_WEBHOOK_URL` if
it is set — a log drain, an alerting endpoint, a Slack incoming webhook, a
proxy in front of whichever tracker you choose. Request headers are copied
from an allowlist: `cookie` carries the Payload session, and must never leave.

The subpath import keeps the CMS out of this file. This hook runs when
something has already gone wrong, and loading Payload here would put the whole
CMS in the one path that has to work regardless.
*/
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const report = buildRequestErrorReport(error, request, context)
  console.error('[error]', JSON.stringify(report))
  await reportError(report)
}

/** Once per server instance: say so if error reports are going nowhere. */
export function register(): void {
  const status = describeErrorReporting()
  if (!status.startsWith('error reporting: on')) console.warn('[boot]', status)
}
