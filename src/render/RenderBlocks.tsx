import { Fragment, type ComponentType, type JSX, type ReactNode } from 'react'
import type { ContentField } from '../generate/fields'
import { coerceBlock, type CoerceContext } from './coerce'

/** The shape every stored block has, whatever its type. */
export interface StoredBlock {
  blockType: string
  id?: string | null
  blockName?: string | null
  [key: string]: unknown
}

export interface RenderBlocksProps {
  blocks: readonly StoredBlock[] | null | undefined
  /** blockType → the React component that renders it. */
  registry: Readonly<Record<string, ComponentType<Record<string, unknown>>>>
  /** blockType → the contract fields the block was generated from. */
  fields: Readonly<Record<string, ContentField[]>>
  context: CoerceContext
  /**
   * What to do with a block whose type has no component. Defaults to rendering
   * nothing — a page with one unrenderable block should still serve.
   */
  onUnknownBlock?: (blockType: string) => ReactNode
  /**
   * Extra props merged into a block's, keyed by `blockType`.
   *
   * For the things a route supplies and an editor cannot author. The filter row
   * in the Insights hero is the case this exists for: a row of links built from
   * the taxonomy and the current URL, handed to `ImageHero` as `children`.
   * Nobody types it into a block, and `coerceBlock` only ever produces props the
   * contract declares — so without a way in, route-driven content has no way to
   * reach a component that a block renders.
   *
   * Applies to **every** block of that type on the page. Pages carrying two of
   * one component and wanting them to differ want their own routes, not a
   * cleverer key here.
   */
  slots?: Readonly<Record<string, Record<string, unknown>>>
}

/**
 * Renders a stored `layout` as design-system components.
 *
 * A server component. The components that call hooks carry their own
 * `'use client'`, so the boundary is drawn per component by the design system
 * rather than here — which is what keeps the rest out of the client bundle.
 */
export function RenderBlocks({
  blocks,
  registry,
  fields,
  context,
  onUnknownBlock,
  slots,
}: RenderBlocksProps): JSX.Element | null {
  if (!blocks || blocks.length === 0) return null

  return (
    <>
      {blocks.map((block, index) => {
        const Component = registry[block.blockType]
        const contractFields = fields[block.blockType]

        if (!Component || !contractFields) {
          return (
            <Fragment key={block.id ?? index}>{onUnknownBlock?.(block.blockType) ?? null}</Fragment>
          )
        }

        /* Slot props last: the route knows things the stored block does not,
           and a block cannot author its way into overriding them. */
        const props = {
          ...coerceBlock(block.blockType, contractFields, block, context),
          ...slots?.[block.blockType],
        }
        return <Component key={block.id ?? index} {...props} />
      })}
    </>
  )
}
