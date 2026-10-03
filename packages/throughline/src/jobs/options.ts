import type { Payload } from 'payload'

/**
 * A workflow factory's options, as its job builder takes them: no Inngest
 * client, and Payload optional.
 *
 * Optional because a job may be declared before Payload exists — a jobs
 * adapter like `payloadJobs` is handed its jobs while the config is still being
 * built. Such a job finds Payload on its context when it runs instead.
 */
export type JobOptions<T> = Omit<T, 'inngest' | 'payload'> & { payload?: Payload }

/**
 * The Payload a job runs against: the one it was built with, or the one its
 * runner supplies. Throws, naming the job, when there is neither.
 */
export function jobPayload(
  fromOptions: Payload | undefined,
  fromContext: Payload | undefined,
  jobId: string,
): Payload {
  const payload = fromOptions ?? fromContext
  if (!payload) {
    throw new Error(
      `Job "${jobId}" needs Payload: pass \`payload\` in its options, or run it on payloadJobs (or inngestJobs given \`payload\`).`,
    )
  }
  return payload
}
