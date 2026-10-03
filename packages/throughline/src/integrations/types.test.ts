import type { InngestFunction } from 'inngest'
import { describe, expect, it } from 'vitest'
import { IntegrationRegistry } from './registry.js'
import type { Integration, IntegrationContext } from './types.js'

/*
`Integration.createFunctions` is generic in its return type, and these are what
say so.

It used to name `InngestFunction.Any`, and that cost a consumer two casts: pnpm
keys an `inngest` instance by its resolved peer set, `inngest` declares optional
peers on `express`, `hono` and `next`, and installing anything that pulls one of
those in gives a host a structurally identical, nominally different type. Nothing
in this package inspects or invokes what comes back — the one use anywhere is
`.length`, for a log line — so naming the type bought nothing and broke a
boundary.

A type-level regression is invisible at runtime, so these assert on shapes: if
the signature narrows again, the second one stops compiling.
*/

const context = {} as IntegrationContext

function base(id: string) {
  return {
    id,
    name: id,
    description: 'A test integration.',
    category: 'crm' as const,
    configFields: [],
    validateConfig: async () => ({ ok: true }),
    subscribes: [],
  }
}

describe('Integration.createFunctions', () => {
  it('accepts an integration whose functions are plain objects', () => {
    const integration: Integration = {
      ...base('opaque'),
      createFunctions: () => [{ id: 'one' }, { id: 'two' }],
    }

    expect(integration.createFunctions(context)).toHaveLength(2)
  })

  /*
  The case that matters. A host names its *own* `InngestFunction.Any`, and it
  flows through — no cast, and no dependency on which `inngest` instance this
  package happened to resolve.
  */
  it("accepts a host's own Inngest function type", () => {
    const hostFunctions = [{ id: () => 'sync' }] as unknown as InngestFunction.Any[]

    const integration: Integration<{ token: string }, InngestFunction.Any> = {
      ...base('typed'),
      validateConfig: async () => ({ ok: true }),
      createFunctions: () => hostFunctions,
    }

    expect(integration.createFunctions(context)).toBe(hostFunctions)
  })

  /*
  And it still registers. The registry stores `Integration` at the default
  `unknown`, so a narrower one has to remain assignable to it — return positions
  are covariant, which is what makes that true and what a narrowing of the
  signature would break.
  */
  it('registers an integration that named its function type', () => {
    const registry = new IntegrationRegistry<InngestFunction.Any>()
    const integration: Integration<Record<string, unknown>, InngestFunction.Any> = {
      ...base('registered'),
      createFunctions: () => [],
    }

    registry.register(integration)

    expect(registry.get('registered')?.id).toBe('registered')
    expect(registry.list()).toHaveLength(1)
  })

  /*
  And the type survives the round trip through the registry, which is the part a
  host depends on. Erased, `list()` gives back `unknown[]` and the host cannot
  hand it to `serve()` without asserting — which is the assertion this whole
  change exists to delete.
  */
  it('gives the function type back from list(), not unknown', () => {
    const registry = new IntegrationRegistry<InngestFunction.Any>()
    const hostFunctions = [{ id: () => 'sync' }] as unknown as InngestFunction.Any[]
    registry.register({ ...base('round-trip'), createFunctions: () => hostFunctions })

    const served: InngestFunction.Any[] = registry
      .list()
      .flatMap(integration => integration.createFunctions(context))

    expect(served).toEqual(hostFunctions)
  })
})
