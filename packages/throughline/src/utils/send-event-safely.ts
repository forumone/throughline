import type { Inngest } from 'inngest'

type EventPayload = Parameters<Inngest['send']>[0]

/**
 * Emits an event without letting a transport failure fail the action that
 * already completed. Returns a warning naming `consequence` on failure, `null`
 * on success.
 *
 * Every caller writes first and emits afterwards: the event is a consequence of
 * the write, not a step in it. Throwing here would report an action as failed
 * after it had landed — a publish that is live, an approval request that is
 * stored, a decision that is recorded — and the obvious response is to do it
 * again.
 */
export async function sendEventSafely(
  inngest: Pick<Inngest, 'send'>,
  event: EventPayload,
  consequence: string,
): Promise<string | null> {
  try {
    await inngest.send(event)
    return null
  } catch (error) {
    return `The ${eventName(event)} event could not be sent, so ${consequence}: ${describeError(error)}`
  }
}

function eventName(event: EventPayload): string {
  if (Array.isArray(event)) return event[0]?.name ?? 'an'
  return (event as { name?: string }).name ?? 'an'
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
