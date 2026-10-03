import type { Block } from 'payload'
import { describe, expect, it } from 'vitest'
import type { GeneratedBlock, ManifestLike } from '../generate/blocks.js'
import type { ContentField } from '../generate/fields.js'
import { defaultMismatches } from './contractDefaults.js'
import { runValidateCase, untouchedCases } from './untouchedBlocks.js'

export interface BlockInvariantOptions {
  /**
   * Where to find each block's contract when `blocks` are plain Payload
   * blocks. Not needed for the `GeneratedBlock[]` that `generateBlocks`
   * returns, which carry their contract.
   */
  manifest?: ManifestLike
  /**
   * The fewest blocks the list may hold. A manifest that failed to load would
   * make every assertion vacuous, so set this near the library's real size.
   * Defaults to 1.
   */
  minBlocks?: number
  /** The suite's name. Defaults to "design-system block invariants". */
  title?: string
}

type BlockInput = Block | GeneratedBlock

const isGenerated = (input: BlockInput): input is GeneratedBlock =>
  'block' in input && 'component' in input

/**
 * Registers a vitest suite asserting what every generated block must hold:
 *
 * - **Untouched blocks validate.** Every field `validate` passes the data
 *   Payload stores for a freshly-added block, and again with one empty row in
 *   every array.
 * - **Contract defaults survive.** Every generated checkbox starts where its
 *   contract says, and no generated text field has a string default.
 *
 * ```ts
 * import { designSystemBlocks } from './index.js'
 * describeBlockInvariants(designSystemBlocks, { manifest, minBlocks: 40 })
 * ```
 *
 * No database and no Payload instance: a block config is a value, and a
 * `validate` is a function on it.
 */
export function describeBlockInvariants(
  input: readonly BlockInput[],
  options: BlockInvariantOptions = {},
): void {
  const blocks = input.map(item => (isGenerated(item) ? item.block : item))
  const contracts = new Map<string, readonly ContentField[]>()
  for (const item of input) {
    if (isGenerated(item)) contracts.set(item.block.slug, item.component.content.fields)
  }
  if (options.manifest) {
    for (const block of blocks) {
      const component = options.manifest.components[block.slug]
      if (component && !contracts.has(block.slug))
        contracts.set(block.slug, component.content.fields)
    }
  }

  describe(options.title ?? 'design-system block invariants', () => {
    it('has the whole library, not an empty list', () => {
      expect(blocks.length).toBeGreaterThanOrEqual(Math.max(1, options.minBlocks ?? 1))
    })

    for (const rows of ['none', 'one'] as const) {
      describe(`a block added and saved with ${rows === 'none' ? 'no array rows' : 'one empty array row'}`, () => {
        const cases = untouchedCases(blocks, rows)

        if (cases.length === 0) {
          // Nothing to call is a fact worth seeing, not a failure: a library
          // with no optional groups or links has no generated validate.
          it.skip('no generated field carries a validate')
          return
        }

        it.each(cases.map(found => [found.path, found] as const))(
          '%s validates',
          async (path, found) => {
            const result = await runValidateCase(found)
            expect(
              result,
              `${path} refuses an untouched block: "${String(result)}". An author would see that ` +
                'on a block they have just added and not yet typed into.',
            ).toBe(true)
          },
        )
      })
    }

    describe('contract defaults survive into the CMS', () => {
      it('knows the contract of every block', () => {
        const unknown = blocks.filter(block => !contracts.has(block.slug)).map(block => block.slug)
        expect(
          unknown,
          'pass the GeneratedBlock[] from generateBlocks, or the manifest as options.manifest',
        ).toEqual([])
      })

      const withContracts = blocks.filter(block => contracts.has(block.slug))
      if (withContracts.length === 0) return

      it.each(withContracts.map(block => [block.slug, block] as const))(
        '%s starts where its contract says',
        (_slug, block) => {
          const mismatches = defaultMismatches(block, contracts.get(block.slug) ?? [])
          expect(mismatches.map(mismatch => mismatch.message)).toEqual([])
        },
      )
    })
  })
}
