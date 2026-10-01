/*
An Inngest-shaped event sender for a site with no Inngest. Transitional.

Several plugins take an `inngest` option and use it for exactly one thing,
`send`: audit, publishing and approvals announce what happened, and the jobs
that react are the runner's concern. A site on Payload Jobs has no Inngest
client to give them. This is one: `send` goes through the jobs adapter's
`emit`, and anything else on it throws, naming the fix, rather than failing
somewhere unrelated on `undefined`.

Transitional because it lies about its type. 1.0 P3 replaces every plugin's
`inngest` option with the jobs adapter itself, and this goes.
*/
import type { Inngest } from 'inngest'
import type { JobEvent, JobsAdapter } from './types.js'

export function eventSenderFor(adapter: Pick<JobsAdapter, 'emit'>): Inngest {
  const target = {
    send: async (event: JobEvent | readonly JobEvent[]) => {
      await adapter.emit(event)
      return { ids: [] as string[] }
    },
  }
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key as keyof typeof object]
      // Read by `await`, inspection and coercion; none of them is a use.
      if (typeof key === 'symbol' || key === 'then' || key === 'toJSON') return undefined
      throw new Error(
        `This Inngest client is an event sender for a jobs adapter, and has no \`${key}\`. Only \`send\` works on it.`,
      )
    },
  }) as unknown as Inngest
}
