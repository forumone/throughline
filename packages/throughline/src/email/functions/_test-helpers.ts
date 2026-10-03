import { inngestJobs } from '../../jobs/inngest/adapter.js'
import type { Job, JobContext } from '../../jobs/types.js'
import type { WorkflowFailureHandler } from '../../jobs/workflow-types.js'
import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient, SendEmailParams } from '../client.js'

interface CreatedFunction {
  id: string
  options: Record<string, unknown>
  handler: (ctx: HandlerCtx) => Promise<unknown>
}

export interface HandlerCtx {
  event: { name: string; data: unknown }
  step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  logger: {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
  }
}

export interface FakeInngest {
  inngest: Inngest
  functions: CreatedFunction[]
  invoke: (fnId: string, event: { name: string; data: unknown }) => Promise<unknown>
}

export function createFakeInngest(): FakeInngest {
  const functions: CreatedFunction[] = []
  const inngest = {
    createFunction: (
      options: Record<string, unknown> & { id: string },
      handler: (ctx: HandlerCtx) => Promise<unknown>,
    ): InngestFunction.Any => {
      functions.push({ id: options.id, options, handler })
      return { id: () => options.id } as unknown as InngestFunction.Any
    },
    send: async () => {},
  } as unknown as Inngest
  return {
    inngest,
    functions,
    invoke: async (fnId, event) => {
      const fn = functions.find((f) => f.id === fnId)
      if (!fn) throw new Error(`Function "${fnId}" not registered`)
      return fn.handler({
        event,
        step: { run: async (_n, run) => run() },
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      })
    },
  }
}

export function createFakePayload(byId: Record<string, Record<string, unknown>>): Payload {
  return {
    findByID: async ({ id }: { id: string }) => byId[id] ?? null,
  } as unknown as Payload
}

export interface FakeEmailClient extends EmailClient {
  sends: SendEmailParams[]
}

export function createFakeEmailClient(): FakeEmailClient {
  const sends: SendEmailParams[] = []
  const client: EmailClient = {
    send: async (params) => {
      sends.push(params)
      return { id: `msg-${sends.length}`, deliveredAt: new Date().toISOString() }
    },
  }
  return Object.assign(client, { sends }) as FakeEmailClient
}

/**
 * A notification as the Inngest function `emailPlugin` registers: what the
 * 0.x `createNotify…Function` factories built, which these suites were written
 * against. They are gone in 1.0; each call site became
 * `notifyFunction(<the job>, <the factory's deps>)`.
 */
export function notifyFunction<
  Deps extends { inngest: Inngest; id?: string; onFailure?: WorkflowFailureHandler },
>(
  job: (resolve: (context: JobContext) => Deps, id?: string) => Job,
  deps: Deps,
): InngestFunction.Any {
  return inngestJobs(deps.inngest, deps.onFailure ? { onFailure: deps.onFailure } : {}).toFunction(
    job(() => deps, deps.id),
  )
}
