import type { Inngest } from 'inngest'
import { sendEventSafely as send } from '../utils/send-event-safely.js'

type EventPayload = Parameters<Inngest['send']>[0]

/**
 * Emits a publishing event without letting a transport failure fail the
 * publish that already landed. Returns a warning on failure, `null` on success.
 *
 * Publishing writes the document first and emits afterwards. Throwing here
 * would tell an editor their change didn't go live when it did, and the obvious
 * response to that is to click Publish again on content that is already live.
 */
export async function sendEventSafely(
  inngest: Inngest,
  event: EventPayload,
): Promise<string | null> {
  return await send(inngest, event, 'revalidation and integrations may not have run')
}
