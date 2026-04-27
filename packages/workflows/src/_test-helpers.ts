import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'

interface CreatedFunction {
  id: string
  options: Record<string, unknown>
  handler: HandlerFn
}

type HandlerFn = (ctx: HandlerCtx) => Promise<unknown>

export interface HandlerCtx {
  event: { name: string; data: unknown }
  step: {
    run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  }
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void; debug: (...args: unknown[]) => void }
}

/**
 * Minimal fake Inngest client. Captures `createFunction` definitions so
 * tests can run their handlers directly, and records `send` events so
 * tests can assert on the fan-out.
 */
export interface FakeInngest {
  inngest: Inngest
  functions: CreatedFunction[]
  sends: Array<{ name: string; data: unknown }>
  invoke: (
    fnId: string,
    event: { name: string; data: unknown },
  ) => Promise<unknown>
}

export function createFakeInngest(): FakeInngest {
  const functions: CreatedFunction[] = []
  const sends: Array<{ name: string; data: unknown }> = []

  const inngest = {
    createFunction: (
      options: Record<string, unknown> & { id: string },
      handler: HandlerFn,
    ): InngestFunction.Any => {
      functions.push({ id: options.id, options, handler })
      return { id: () => options.id } as unknown as InngestFunction.Any
    },
    send: async (event: { name: string; data: unknown } | Array<{ name: string; data: unknown }>) => {
      const arr = Array.isArray(event) ? event : [event]
      for (const item of arr) sends.push(item)
    },
  } as unknown as Inngest

  return {
    inngest,
    functions,
    sends,
    invoke: async (fnId, event) => {
      const fn = functions.find((f) => f.id === fnId)
      if (!fn) throw new Error(`Function "${fnId}" not registered`)
      const ctx: HandlerCtx = {
        event,
        step: { run: async (_name, run) => run() },
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      }
      return fn.handler(ctx)
    },
  }
}

interface FindArgs {
  collection: string
  where?: { and?: Array<Record<string, Record<string, unknown>>> }
  limit?: number
  sort?: string
}

interface UpdateArgs {
  collection: string
  id: string
  data: Record<string, unknown>
}

export interface FakePayloadHandle {
  payload: Payload
  finds: FindArgs[]
  updates: UpdateArgs[]
  setDocs: (docs: Array<Record<string, unknown>>) => void
}

export function createFakePayload(initialDocs: Array<Record<string, unknown>> = []): FakePayloadHandle {
  let docs = [...initialDocs]
  const finds: FindArgs[] = []
  const updates: UpdateArgs[] = []

  const payload = {
    find: async (args: FindArgs) => {
      finds.push(args)
      const matched = docs.filter((doc) =>
        (args.where?.and ?? []).every((condition) => matchCondition(doc, condition)),
      )
      return {
        docs: matched.slice(0, args.limit ?? matched.length),
        totalDocs: matched.length,
        page: 1,
        totalPages: 1,
        limit: args.limit ?? matched.length,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
        pagingCounter: 1,
      }
    },
    update: async (args: UpdateArgs) => {
      updates.push(args)
      docs = docs.map((doc) =>
        String(doc['id']) === args.id ? { ...doc, ...args.data } : doc,
      )
      return docs.find((d) => String(d['id']) === args.id)
    },
  } as unknown as Payload

  return {
    payload,
    finds,
    updates,
    setDocs: (next) => {
      docs = next
    },
  }
}

function matchCondition(
  doc: Record<string, unknown>,
  condition: Record<string, Record<string, unknown>>,
): boolean {
  const [field, ops] = Object.entries(condition)[0] ?? ['', {}]
  if (!field) return true
  const value = doc[field]
  for (const [op, operand] of Object.entries(ops)) {
    if (op === 'equals' && value !== operand) return false
    if (op === 'less_than') {
      if (!(typeof value === 'string' && value < String(operand))) return false
    }
    if (op === 'less_than_equal') {
      if (!(typeof value === 'string' && value <= String(operand))) return false
    }
    if (op === 'exists') {
      const present = value !== undefined && value !== null && value !== ''
      if (operand === true && !present) return false
      if (operand === false && present) return false
    }
  }
  return true
}
