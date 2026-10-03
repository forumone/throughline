import type { Inngest } from 'inngest'

type EventPayload = Parameters<Inngest['send']>[0]

/**
 * Emits an Inngest event without letting a transport failure fail the action
 * that already completed. Returns a warning message on failure, `null` on
 * success.
 *
 * Publishing writes the document first and emits afterwards. The event is a
 * consequence of the write, not a step in it — if the emission fails the
 * document is still published. Throwing here would tell an editor their
 * change didn't go live when it did, and the obvious response to that is to
 * click Publish again on content that is already live.
 */
export async function sendEventSafely(
  inngest: Inngest,
  event: EventPayload,
): Promise<string | null> {
  try {
    await inngest.send(event)
    return null
  } catch (error) {
    const name = eventName(event)
    return `The ${name} event could not be sent, so revalidation and integrations may not have run: ${describeError(error)}`
  }
}

function eventName(event: EventPayload): string {
  if (Array.isArray(event)) return event[0]?.name ?? 'publishing'
  return (event as { name?: string }).name ?? 'publishing'
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
