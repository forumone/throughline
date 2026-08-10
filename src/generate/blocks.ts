import type { Block } from 'payload'
import type { Overrides } from '../overrides'
import { toPayloadField, type ContentField, type FieldContext } from './fields'

/** The slice of a manifest component entry the generator reads. */
export interface ManifestComponent {
  name: string
  category: string
  description: string
  intent: string
  composition: {
    placement: string[]
    maxPerPage: number | null
    requiredSiblings: string[]
    forbiddenAdjacent: string[]
    allowedSlots?: Record<string, string[]>
  }
  content: { fields: ContentField[] }
}

export interface ManifestLike {
  components: Record<string, ManifestComponent>
}

export interface GenerateOptions {
  manifest: ManifestLike
  overrides: Overrides
  mediaCollection: string
  linkCollections: string[]
  resolveSelectOptions: (component: string, path: string) => readonly string[] | null
  resolveNamedOptions: (typeName: string) => readonly string[] | null
}

export interface GeneratedBlock {
  block: Block
  component: ManifestComponent
}

/**
 * Which components are authorable as blocks.
 *
 * `inline` placement means the component is a building block used *inside*
 * another one — a `Card` within a `CardGrid`, a `Button` within a CTA. It
 * reaches the page through its parent's fields, so offering it in the palette
 * would let an author drop a bare card onto a page with nothing around it.
 *
 * `page` and `section` are the two that stand on their own. `notABlock` in the
 * overrides removes the handful that are page-level but not authored — the
 * chrome a template renders rather than a block an author places.
 */
export function isBlockCandidate(component: ManifestComponent, overrides: Overrides): boolean {
  if (overrides[component.name]?.notABlock) return false
  return component.composition.placement.some(p => p === 'page' || p === 'section')
}

/**
 * The block slug is the manifest component name, byte for byte.
 *
 * Not a stylistic choice. `throughline-publishing`'s composition step maps
 * `blockType` straight to `type` with no transformation and looks it up in the
 * manifest; a miss is an `unknown-component` **error**, which blocks publish.
 * Kebab-casing the slugs would make every block on every page unpublishable,
 * and the error would point at the design system rather than at the naming.
 */
export function generateBlock(
  component: ManifestComponent,
  options: GenerateOptions,
): Block {
  const ctx: FieldContext = {
    component: component.name,
    overrides: options.overrides,
    mediaCollection: options.mediaCollection,
    linkCollections: options.linkCollections,
    resolveSelectOptions: options.resolveSelectOptions,
    resolveNamedOptions: options.resolveNamedOptions,
  }

  const fields = component.content.fields
    .map(field => toPayloadField(field, ctx))
    .filter(field => field !== null)

  return {
    slug: component.name,
    interfaceName: `${component.name}Block`,
    labels: {
      singular: humanize(component.name),
      plural: humanize(component.name),
    },
    admin: {
      // The contract's `intent` is the sentence that says when to choose this
      // component over its neighbours. It is the single most useful thing an
      // author can read at the moment they are picking a block, and it already
      // exists — there is no reason to write a worse one here.
      group: humanize(component.category),
    },
    // A block with no authorable fields is still legitimate: some components
    // are entirely presentational. Payload needs a field array, not a non-empty
    // one.
    fields,
  }
}

export function generateBlocks(options: GenerateOptions): GeneratedBlock[] {
  return Object.values(options.manifest.components)
    .filter(component => isBlockCandidate(component, options.overrides))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(component => ({ block: generateBlock(component, options), component }))
}

/** `CollageHero` → `Collage Hero`, `cta` → `Cta`. */
function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
