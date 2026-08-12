/**
 * Client-side helpers shared by the admin Publish and Unpublish controls.
 * No JSX here so the message formatting can be unit tested directly.
 */

export interface PublishingIssue {
  field?: string
  message: string
  severity?: 'error' | 'warning'
  rule?: string
}

export interface PublishingResponse {
  published?: boolean
  unpublished?: boolean
  publishedAt?: string
  failedAt?: string
  reason?: string
  code?: string
  issues?: PublishingIssue[]
  suggestion?: string
  error?: string
}

export interface CallPublishingEndpointArgs {
  serverURL: string
  apiRoute: string
  routePrefix: string
  action: 'publish' | 'unpublish'
  collection: string
  id: number | string
}

export type PublishingCallResult =
  | { ok: true; body: PublishingResponse }
  | { ok: false; message: string }

/**
 * POSTs to the plugin's admin endpoint using the browser's session cookie.
 * Returns a transport-level failure as `ok: false`; a pipeline block comes
 * back as `ok: true` with a `published: false` body.
 */
export async function callPublishingEndpoint(
  args: CallPublishingEndpointArgs,
): Promise<PublishingCallResult> {
  const url = `${args.serverURL}${args.apiRoute}${args.routePrefix}/${args.action}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collection: args.collection, id: args.id }),
    })
  } catch {
    return { ok: false, message: 'Could not reach the publishing server.' }
  }

  let body: PublishingResponse
  try {
    body = (await response.json()) as PublishingResponse
  } catch {
    return { ok: false, message: `Publishing server returned ${response.status}.` }
  }

  if (!response.ok) {
    return {
      ok: false,
      message: body.error ?? `Publishing server returned ${response.status}.`,
    }
  }

  return { ok: true, body }
}

const MAX_LISTED_ISSUES = 5

/**
 * Turns a pipeline block into something an editor can act on: which step
 * said no, what it objected to, and what to do about it. This is the
 * information the pipeline already returns — it just never had a way to
 * reach the screen.
 */
export function describeBlock(body: PublishingResponse): {
  title: string
  description: string
} {
  const title = body.reason ?? `Publish blocked at the ${body.failedAt ?? 'policy'} check.`

  const lines: string[] = []
  if (body.failedAt && body.reason) {
    lines.push(`Blocked at: ${body.failedAt}`)
  }

  const issues = body.issues ?? []
  for (const issue of issues.slice(0, MAX_LISTED_ISSUES)) {
    lines.push(`• ${issue.field ? `${issue.field}: ` : ''}${issue.message}`)
  }
  if (issues.length > MAX_LISTED_ISSUES) {
    lines.push(`• …and ${issues.length - MAX_LISTED_ISSUES} more`)
  }

  if (body.suggestion) {
    lines.push(`Suggestion: ${body.suggestion}`)
  }

  return { title, description: lines.join('\n') }
}
