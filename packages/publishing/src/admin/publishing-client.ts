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
  /** Non-fatal problems on an action that otherwise succeeded. */
  warnings?: string[]
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

/**
 * A field error in the shape Payload's form reducer accepts. `path` is a
 * *form state* path — dotted, with numeric segments for array and block rows —
 * which is not the same dialect the pipeline's issues speak.
 *
 * Structurally `ValidationFieldError` from `payload`, redeclared so this file
 * needs no import of its own and stays unit-testable without a form.
 */
export interface PublishingFieldError {
  path: string
  message: string
}

/**
 * Rewrites a pipeline issue's field path into a form state path.
 *
 * The checks address array members with brackets — `layout[2].image` — because
 * they walk a document. Payload's form state keys the same field
 * `layout.2.image`. One is not a prefix of the other, so an unrewritten path
 * matches no field and the error would land nowhere.
 */
export function toFormPath(field: string): string {
  return field
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '')
}

/**
 * Turns a pipeline block into errors attached to the fields that caused it.
 *
 * `formPaths` is what the form actually has — `Object.keys(getFields())` at the
 * call site. Only those paths are used, and that restriction is load-bearing
 * rather than defensive: Payload's reducer *creates* a field state entry for
 * any path it is handed, and an invented entry becomes invented data on the
 * next save. `speakers.0.portrait` is a real issue path — the pipeline walks
 * the document at depth, so a related person's portrait is in the tree — and
 * writing it into form state would turn a relationship's list of ids into a
 * list of objects.
 *
 * An issue whose exact path is not a field falls back to the nearest ancestor
 * that is, so a problem inside a populated relationship marks the relationship
 * and a block-level composition failure marks the block field. That is also
 * what puts the error count on a *collapsed* block row: the reducer propagates
 * every error path up to its parents.
 *
 * Anything that resolves to no field at all is left out and stays in the toast,
 * which is the whole reason the toast keeps listing the issues.
 */
export function fieldErrorsFromBlock(
  body: PublishingResponse,
  formPaths: Iterable<string>,
): PublishingFieldError[] {
  const paths = formPaths instanceof Set ? formPaths : new Set(formPaths)
  // Grouped, because several issues can resolve to one field — three bad
  // blocks all land on `layout` — and the reducer keeps one message per path.
  const byPath = new Map<string, string[]>()

  for (const issue of body.issues ?? []) {
    if (!issue.field) continue
    const resolved = resolveFieldPath(toFormPath(issue.field), paths)
    if (!resolved) continue
    const messages = byPath.get(resolved) ?? []
    if (!messages.includes(issue.message)) messages.push(issue.message)
    byPath.set(resolved, messages)
  }

  return [...byPath].map(([path, messages]) => ({ path, message: messages.join('; ') }))
}

/** The path itself if the form has it, else its nearest ancestor that it does. */
function resolveFieldPath(path: string, formPaths: Set<string>): string | undefined {
  if (path === '' || path === '(root)') return undefined
  const segments = path.split('.')
  for (let end = segments.length; end > 0; end--) {
    const candidate = segments.slice(0, end).join('.')
    if (formPaths.has(candidate)) return candidate
  }
  return undefined
}

const MAX_LISTED_ISSUES = 5

/**
 * Turns a pipeline block into something an editor can act on: which step
 * said no, what it objected to, and what to do about it. This is the
 * information the pipeline already returns — it just never had a way to
 * reach the screen.
 */
export function describeBlock(
  body: PublishingResponse,
  options: { markedFields?: number } = {},
): {
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

  // Said only when it is true. An editor who has read a toast listing five
  // paths still has to find them, and the answer — they are marked on the
  // fields — is not something the toast otherwise reveals.
  if ((options.markedFields ?? 0) > 0) {
    lines.push('Fields with a problem are highlighted in the form.')
  }

  return { title, description: lines.join('\n') }
}
