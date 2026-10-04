/**
 * Client-side helpers shared by the admin Publish and Unpublish controls.
 * No JSX here so the message formatting can be unit tested directly.
 */

import { goToFirstError } from './first-error.js'
import {
  type HumanDateOptions,
  type MessageDate,
  TRY_AGAIN,
  localiseMessage,
} from '../messages.js'

export interface PublishingIssue {
  field?: string
  message: string
  severity?: 'error' | 'warning'
  rule?: string
  /** Where `field` is, in the editor's words: `Block 3 (Image Hero) › Image`. */
  where?: string
}

export interface PublishingResponse {
  published?: boolean
  unpublished?: boolean
  scheduled?: boolean
  scheduledFor?: string
  unscheduled?: boolean
  publishedAt?: string
  failedAt?: string
  reason?: string
  code?: string
  issues?: PublishingIssue[]
  suggestion?: string
  /** The date `reason` names, for saying it in the editor's own zone. */
  when?: MessageDate
  /** Setup detail for a developer. Never shown to the editor. */
  detail?: string
  /** Non-fatal problems on an action that otherwise succeeded. */
  warnings?: string[]
  error?: string
}

const VERB: Record<CallPublishingEndpointArgs['action'], string> = {
  publish: 'publish',
  unpublish: 'unpublish',
  schedule: 'schedule',
  unschedule: 'cancel the schedule',
}

export interface CallPublishingEndpointArgs {
  serverURL: string
  apiRoute: string
  routePrefix: string
  action: 'publish' | 'unpublish' | 'schedule' | 'unschedule'
  collection: string
  id: number | string
  /** `schedule` only: ISO 8601. */
  publishAt?: string
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
      body: JSON.stringify({
        collection: args.collection,
        id: args.id,
        ...(args.publishAt ? { publishAt: args.publishAt } : {}),
      }),
    })
  } catch {
    return {
      ok: false,
      message: `Couldn't connect to ${VERB[args.action]}. Check your internet connection and try again. Nothing was changed.`,
    }
  }

  const unexpected = `Publishing didn't respond as expected (error ${response.status}). ${TRY_AGAIN}`
  let body: PublishingResponse
  try {
    body = (await response.json()) as PublishingResponse
  } catch {
    return { ok: false, message: unexpected }
  }

  if (!response.ok) {
    return { ok: false, message: body.error ?? unexpected }
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
    const exact = toFormPath(issue.field)
    const resolved = resolveFieldPath(exact, paths)
    if (!resolved) continue
    // On the field itself the field is the location. On an ancestor — three
    // blocks' problems all on `layout` — each needs saying which it is.
    const message =
      resolved !== exact && issue.where ? `${issue.where}: ${issue.message}` : issue.message
    const messages = byPath.get(resolved) ?? []
    if (!messages.includes(message)) messages.push(message)
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
 * Turns a pipeline block into something an editor can act on: what is wrong,
 * where, and what to do about it. forumone-2026#805.
 *
 * Which step refused is software's business — it stays in `failedAt` and
 * `code` — and an issue's location is said the way the edit view says it,
 * `Block 3 (Image Hero) › Image`, from the `where` the pipeline attached.
 * An issue the pipeline could not place is listed by its message alone, never
 * by its raw path. A date the server wrote in its own zone is rewritten into
 * the editor's.
 */
export function describeBlock(
  body: PublishingResponse,
  options: { markedFields?: number; date?: HumanDateOptions } = {},
): {
  title: string
  description: string
} {
  const local = (text: string) => localiseMessage(text, body.when, options.date)
  const title = body.reason ? local(body.reason) : "This can't be published yet."

  const lines: string[] = []

  const issues = body.issues ?? []
  for (const issue of issues.slice(0, MAX_LISTED_ISSUES)) {
    lines.push(`• ${issue.where ? `${issue.where}: ` : ''}${issue.message}`)
  }
  if (issues.length > MAX_LISTED_ISSUES) {
    lines.push(`• …and ${issues.length - MAX_LISTED_ISSUES} more`)
  }

  if (body.suggestion) {
    lines.push(local(body.suggestion))
  }

  // Said only when it is true. An editor who has read a toast listing five
  // problems still has to find them, and the answer — they are marked on the
  // fields — is not something the toast otherwise reveals.
  if ((options.markedFields ?? 0) > 0) {
    lines.push('The fields with a problem are highlighted.')
  }

  return { title, description: lines.join('\n') }
}

/**
 * The "Show me" action on an error toast whose problems are marked on fields:
 * takes the editor to the first of them again, for one who has scrolled away.
 * The toast stays open, since it is still the list of what to fix.
 */
export const SHOW_ME = {
  label: 'Show me',
  onClick: (event: { preventDefault: () => void }) => {
    event.preventDefault()
    void goToFirstError()
  },
}

/**
 * The toast id for a refusal of `action` on one document, so a second click
 * replaces the first toast rather than stacking a copy on it.
 */
export function blockToastId(
  action: CallPublishingEndpointArgs['action'],
  collection: string,
  id: number | string,
): string {
  return `throughline:${action}-blocked:${collection}:${id}`
}
