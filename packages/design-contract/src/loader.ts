import { type Manifest, ManifestSchema } from './manifest.js'
import { groupOf } from './schema.js'
import type { ComponentContract, ComponentCategory, ComponentGroup } from './schema.js'

/**
 * A validated, queryable manifest. Returned by {@link loadManifest} and
 * {@link loadManifestFromUrl}. Consumers use the helper methods rather than
 * poking at {@link raw} directly, which lets the implementation evolve.
 */
export class LoadedManifest {
  constructor(public readonly raw: Manifest) {}

  /** The design system's metadata. */
  get designSystem(): Manifest['designSystem'] {
    return this.raw.designSystem
  }

  /** The contract version this manifest satisfies. */
  get contractVersion(): Manifest['contractVersion'] {
    return this.raw.contractVersion
  }

  /** Full contract for a component by name, or `undefined` if absent. */
  getComponent(name: string): ComponentContract | undefined {
    return this.raw.components[name]
  }

  /** Like {@link getComponent} but throws when the component is missing. */
  requireComponent(name: string): ComponentContract {
    const component = this.getComponent(name)
    if (!component) {
      throw new Error(`Component "${name}" not found in manifest`)
    }
    return component
  }

  /** Every component name in declaration order. */
  listComponents(): string[] {
    return Object.keys(this.raw.components)
  }

  /** Every component whose category matches. */
  listByCategory(category: ComponentCategory | string): ComponentContract[] {
    return Object.values(this.raw.components).filter((c) => c.category === category)
  }

  /** Every distinct category present, sorted alphabetically. */
  listCategories(): string[] {
    const categories = new Set<string>()
    for (const component of Object.values(this.raw.components)) {
      categories.add(component.category)
    }
    return Array.from(categories).sort()
  }

  /**
   * Every component filed under a shelf. Matches on the resolved group, so a
   * component with no `group` is found by its category.
   */
  listByGroup(group: ComponentGroup | string): ComponentContract[] {
    return Object.values(this.raw.components).filter((c) => groupOf(c) === group)
  }

  /** Every distinct resolved group present, sorted alphabetically. */
  listGroups(): string[] {
    const groups = new Set<string>()
    for (const component of Object.values(this.raw.components)) {
      groups.add(groupOf(component))
    }
    return Array.from(groups).sort()
  }

  /** Token definition by name, or `undefined` if absent. */
  getToken(name: string) {
    return this.raw.tokens.find((t) => t.name === name)
  }
}

/**
 * Loads a manifest from a plain object. Validates against {@link ManifestSchema}
 * and throws on any validation error with a readable, line-by-line message.
 */
export function loadManifest(input: unknown): LoadedManifest {
  const result = ManifestSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid manifest:\n${issues}`)
  }
  return new LoadedManifest(result.data)
}

/**
 * Fetches a manifest from a URL and loads it. Useful when a design system
 * serves its manifest via HTTP rather than bundling into the consumer.
 */
export async function loadManifestFromUrl(
  url: string,
  init?: RequestInit,
): Promise<LoadedManifest> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest from ${url}: HTTP ${response.status}`)
  }
  const json = (await response.json()) as unknown
  return loadManifest(json)
}
