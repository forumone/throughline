/**
 * A component's name the way an editor reads it: `CollageHero` → `Collage Hero`.
 *
 * The rule the generated blocks label themselves by, so a message that names a
 * component without a block config to hand — the composition validator, a
 * publish check — names it the way the block picker does. A host that renames a
 * block in its overrides has a label of its own; pass that where it is known.
 */
export function componentDisplayName(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
