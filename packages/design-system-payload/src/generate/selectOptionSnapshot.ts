import type { ManifestLike } from './blocks'
import type { ContentField } from './fields'
import { SelectOptionResolver } from './selectOptions'

/**
 * Every resolvable set of allowed values, keyed `Component.field.path`, plus
 * the named unions under `#TypeName`.
 */
export type SelectOptionSnapshot = Record<string, readonly string[]>

/**
 * Reads the design system's types once, at build time, and writes down what it
 * found.
 *
 * Resolution needs a TypeScript `Program` over the whole declaration tree —
 * seconds of work and a dependency on `typescript` being installed. Doing that
 * when the Payload config loads would put it on every serverless cold start,
 * for an answer that cannot change between deploys. So it happens in a script,
 * the result is committed, and the runtime reads a small JSON object.
 *
 * Committing it also makes the values reviewable: rename a member of
 * `CardVariant` and the diff says so, in the same pull request as the rename.
 */
export function collectSelectOptions(options: {
  manifest: ManifestLike
  typesEntry: string
  /** Named unions to include regardless of any field referencing them. */
  namedTypes?: string[]
}): SelectOptionSnapshot {
  const resolver = new SelectOptionResolver(options.typesEntry)
  const snapshot: SelectOptionSnapshot = {}

  for (const typeName of options.namedTypes ?? []) {
    const values = resolver.resolveNamed(typeName)
    if (values) snapshot[`#${typeName}`] = values
  }

  for (const component of Object.values(options.manifest.components)) {
    walk(component.content.fields, '', path => {
      const values = resolver.resolve(component.name, path)
      if (values) snapshot[`${component.name}.${path}`] = values
    })
  }

  return Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Visits every field path, not only the `select` ones.
 *
 * A `text` field whose prop is a literal union is a select the contract could
 * not express — `IntroSection.actions[].icon` is the case — so the snapshot has
 * to carry those too or the generator cannot find them.
 */
function walk(fields: ContentField[], prefix: string, visit: (path: string) => void): void {
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name
    visit(path)
    if (field.of) walk(field.of, path, visit)
  }
}
