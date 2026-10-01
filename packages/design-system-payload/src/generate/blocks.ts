import { groupOf } from '@forumone/throughline-design-contract'
import type { Block, Field } from 'payload'
import { withAltFallback } from '../altText'
import type { Overrides } from '../overrides'
import { toPayloadField, type ContentField, type FieldContext } from './fields'
import { blockGuidance, humanize } from './guidance'
import { groupLabel } from './labels'
import { arrange, blockSummaryFields } from './layout'

const BLOCK_SUMMARY = '@forumone/throughline-design-system-payload/client#BlockSummary'

/** The slice of a manifest component entry the generator reads. */
export interface ManifestComponent {
  name: string
  category: string
  group?: string
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
  /**
   * The host's labels for option values whose meaning is particular to its
   * design system — `{ 'text-image': 'Text and image' }`. Consulted before the
   * generic words in `./labels.ts`, which cover heading levels, HTML elements
   * and anything that reads well split into words.
   */
  optionLabels?: Readonly<Record<string, string>>
  /**
   * A thumbnail for the block picker, or null for none.
   *
   * Payload draws a generic placeholder when a block has no `imageURL`, so a
   * palette this size renders as dozens of identical grey mountains — worse
   * than nothing, because the uniformity implies the images carry information.
   */
  resolvePreview?: (component: string) => { url: string; alt?: string } | null
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
export function generateBlock(component: ManifestComponent, options: GenerateOptions): Block {
  const ctx: FieldContext = {
    component: component.name,
    overrides: options.overrides,
    mediaCollection: options.mediaCollection,
    linkCollections: options.linkCollections,
    resolveSelectOptions: options.resolveSelectOptions,
    resolveNamedOptions: options.resolveNamedOptions,
    ...(options.optionLabels ? { optionLabels: options.optionLabels } : {}),
  }

  // Arranged for an author to read — pairs grouped, settings behind a
  // disclosure. Presentational only; see `./layout.ts`. An alt beside its image
  // falls back to the media's, so it is generated optional; see `../altText.ts`.
  const contract = withAltFallback(component.content.fields)
  const generated = contract.map(field => toPayloadField(field, ctx))
  const fields = arrange(contract, generated, { disclose: true })

  const preview = options.resolvePreview?.(component.name) ?? null
  const guidance = blockGuidance(component.intent, Object.keys(options.manifest.components))
  // The picker's name for it. An override for the few names a mechanical split
  // gets wrong — `AtAGlance` → "At AGlance" — or that mislead.
  const label = options.overrides[component.name]?.label ?? humanize(component.name)

  return {
    slug: component.name,
    interfaceName: `${component.name}Block`,
    // The preview is described by the block's label, not its slug: a screen
    // reader announced "A preview of the HighImpactCTA component".
    ...(preview
      ? { imageURL: preview.url, imageAltText: preview.alt ?? `A preview of the ${label} block` }
      : {}),
    labels: {
      singular: label,
      plural: label,
    },
    admin: {
      // A collapsed block says what it holds, not only what type it is — see
      // `../admin/BlockSummary.tsx`. Every block gets it, including one with
      // no text to show, so every header on a page is drawn by the same code.
      components: {
        Label: {
          path: BLOCK_SUMMARY,
          clientProps: {
            fields: blockSummaryFields(component.content.fields, generated),
            singular: label,
            slug: component.name,
          },
        },
      },
      // Which shelf of the picker this block sits on.
      //
      // `groupOf` is the contract's resolver: a component's `group` when it
      // sets one, its `category` when it does not. Both fields are read through
      // it rather than either directly, so a component that has not been given
      // a group still lands somewhere sensible instead of on a nameless shelf.
      //
      // The two are different questions. `category` is what the component *is*,
      // and other consumers read it that way — the components MCP server
      // filters on it. `group` is where an author looks for it. Grouping on
      // `category` alone put over half the picker under "Section", which is the
      // flat list the grouping exists to avoid.
      group: groupLabel(groupOf(component)),
    },
    // A block with no authorable fields is still legitimate: some components
    // are entirely presentational. Payload needs a field array, not a non-empty
    // one.
    //
    // Headed by what the block is for — see `./guidance.ts`. A `ui` field, so
    // it stores nothing and is absent from the generated types.
    fields: guidance ? [guidanceField(guidance), ...fields] : fields,
  }
}

const BLOCK_GUIDANCE = '@forumone/throughline-design-system-payload/client#BlockGuidance'

function guidanceField(text: string): Field {
  return {
    name: 'blockGuidance',
    type: 'ui',
    admin: { components: { Field: { path: BLOCK_GUIDANCE, clientProps: { text } } } },
  }
}

export function generateBlocks(options: GenerateOptions): GeneratedBlock[] {
  return Object.values(options.manifest.components)
    .filter(component => isBlockCandidate(component, options.overrides))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(component => ({ block: generateBlock(component, options), component }))
}
