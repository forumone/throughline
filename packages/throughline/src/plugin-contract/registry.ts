/**
 * A lightweight registry plugins use to announce their presence and discover
 * sibling plugins. Attached to the Payload instance via a symbol so it does
 * not pollute the public API surface.
 */

const REGISTRY_SYMBOL = Symbol.for('@forumone/throughline/plugin-registry')

export interface PluginRegistryEntry {
  id: string
  version: string
  capabilities: string[]
}

export interface PluginRegistry {
  register(entry: PluginRegistryEntry): void
  has(id: string): boolean
  get(id: string): PluginRegistryEntry | undefined
  list(): PluginRegistryEntry[]
  requireCapability(capability: string, requiredBy: string): void
}

/**
 * Returns the registry attached to the given target (typically the Payload
 * instance passed to `onInit`). Creates and attaches one on first access.
 */
export function getPluginRegistry(target: object): PluginRegistry {
  const host = target as Record<symbol, PluginRegistry | undefined>
  const existing = host[REGISTRY_SYMBOL]
  if (existing) return existing

  const registry = createRegistry()
  Object.defineProperty(target, REGISTRY_SYMBOL, {
    value: registry,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return registry
}

function createRegistry(): PluginRegistry {
  const entries = new Map<string, PluginRegistryEntry>()

  return {
    register(entry) {
      if (entries.has(entry.id)) {
        throw new Error(`Plugin ${entry.id} is already registered`)
      }
      entries.set(entry.id, entry)
    },
    has(id) {
      return entries.has(id)
    },
    get(id) {
      return entries.get(id)
    },
    list() {
      return Array.from(entries.values())
    },
    requireCapability(capability, requiredBy) {
      const providers = Array.from(entries.values()).filter((entry) =>
        entry.capabilities.includes(capability),
      )
      if (providers.length === 0) {
        throw new Error(
          `Plugin ${requiredBy} requires capability "${capability}", but no registered plugin provides it.`,
        )
      }
    },
  }
}
