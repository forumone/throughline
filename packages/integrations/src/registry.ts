import type { Integration } from './types.js'

/**
 * Tiny registry keyed by integration id. Construction is per-plugin-init
 * (not a module-level singleton) so two Payload configs in the same process
 * don't share state. Keeps duplicate-id detection synchronous and simple.
 */
export class IntegrationRegistry {
  private readonly byId = new Map<string, Integration>()

  register(integration: Integration): void {
    if (this.byId.has(integration.id)) {
      throw new Error(`Integration "${integration.id}" is already registered`)
    }
    this.byId.set(integration.id, integration)
  }

  get(id: string): Integration | undefined {
    return this.byId.get(id)
  }

  list(): Integration[] {
    return Array.from(this.byId.values())
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  get size(): number {
    return this.byId.size
  }
}
