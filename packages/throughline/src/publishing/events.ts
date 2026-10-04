import type { Inngest } from 'inngest'
import { sendEventSafely as send } from '../utils/send-event-safely.js'
import { TELL_AN_ADMINISTRATOR } from './messages.js'

type EventPayload = Parameters<Inngest['send']>[0]

/** Anything with a `warn(message)`: Payload's logger, or Throughline's. */
export interface WarnLogger {
  warn: (message: string) => void
}

/**
 * What the editor reads when the change landed and the event after it did not.
 * Said in terms of what they will see, because they cannot see an event: the
 * live site may lag, and so may anything the site sends changes to. Nothing for
 * them to redo — the obvious response to "it failed" is to publish again.
 */
export const EVENT_NOT_SENT = `The live site may take a while to show this change, and connected services may not have been updated. If it still hasn't changed in 15 minutes, ${TELL_AN_ADMINISTRATOR}.`

/**
 * Emits a publishing event without letting a transport failure fail the
 * publish that already landed. Returns a warning on failure, `null` on success.
 *
 * Publishing writes the document first and emits afterwards. Throwing here
 * would tell an editor their change didn't go live when it did, and the obvious
 * response to that is to click Publish again on content that is already live.
 *
 * The warning is for the editor; which event failed and why goes to `logger`,
 * for whoever can fix it. forumone-2026#805.
 */
export async function sendEventSafely(
  inngest: Inngest,
  event: EventPayload,
  logger?: WarnLogger | undefined,
): Promise<string | null> {
  const failure = await send(inngest, event, 'revalidation and integrations may not have run')
  if (failure === null) return null
  logger?.warn(`[publishing] ${failure}`)
  return EVENT_NOT_SENT
}
