import type { Integration } from './types.js'

/**
 * Tiny registry keyed by integration id. Construction is per-plugin-init
 * (not a module-level singleton) so two Payload configs in the same process
 * don't share state. Keeps duplicate-id detection synchronous and simple.
 *
 * Generic in the integrations' function type, and `unknown` by default, for the
 * same reason `Integration` is: this package never touches what
 * `createFunctions` returns, and the host that serves them should not have to
 * assert its way back to its own type after putting them in here.
 *
 * A host names it once, where it reads the registry:
 *
 * ```ts
 * const registry = getIntegrationRegistry<InngestFunction.Any>(payload)
 * const functions = registry?.list().flatMap((i) => i.createFunctions(ctx)) ?? []
 * ```
 */
export class IntegrationRegistry<Fn = unknown> {
  private readonly byId = new Map<string, Integration<Record<string, unknown>, Fn>>()

  register(integration: Integration<Record<string, unknown>, Fn>): void {
    if (this.byId.has(integration.id)) {
      throw new Error(`Integration "${integration.id}" is already registered`)
    }
    this.byId.set(integration.id, integration)
  }

  get(id: string): Integration<Record<string, unknown>, Fn> | undefined {
    return this.byId.get(id)
  }

  list(): Integration<Record<string, unknown>, Fn>[] {
    return Array.from(this.byId.values())
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  get size(): number {
    return this.byId.size
  }
}
