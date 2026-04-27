import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient, SendEmailParams } from '@forumone/throughline-email'

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
  sends: Array<{ name: string; data: unknown }>
  invoke: (fnId: string, event: { name: string; data: unknown }) => Promise<unknown>
}

export function createFakeInngest(): FakeInngest {
  const functions: CreatedFunction[] = []
  const sends: Array<{ name: string; data: unknown }> = []
  const inngest = {
    createFunction: (
      options: Record<string, unknown> & { id: string },
      handler: (ctx: HandlerCtx) => Promise<unknown>,
    ): InngestFunction.Any => {
      functions.push({ id: options.id, options, handler })
      return { id: () => options.id } as unknown as InngestFunction.Any
    },
    send: async (event: { name: string; data: unknown } | Array<{ name: string; data: unknown }>) => {
      const arr = Array.isArray(event) ? event : [event]
      for (const e of arr) sends.push(e)
    },
  } as unknown as Inngest
  return {
    inngest,
    functions,
    sends,
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

export interface FakePayload {
  payload: Payload
  setForm: (form: Record<string, unknown> | null) => void
  setSubmission: (submission: Record<string, unknown> | null) => void
}

export function createFakePayload(): FakePayload {
  let form: Record<string, unknown> | null = null
  let submission: Record<string, unknown> | null = null
  const payload = {
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'forms') return form ? { id, ...form } : null
      if (collection === 'form-submissions') return submission ? { id, ...submission } : null
      return null
    },
  } as unknown as Payload
  return {
    payload,
    setForm: (next) => {
      form = next
    },
    setSubmission: (next) => {
      submission = next
    },
  }
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
