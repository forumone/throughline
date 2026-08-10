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
}

/**
 * Renders a stored `layout` as design-system components.
 *
 * A server component. The 16 components that call hooks carry their own
 * `'use client'`, so the boundary is drawn per component by the design system
 * rather than here — which is what keeps the other 41 out of the client bundle.
 */
export function RenderBlocks({
  blocks,
  registry,
  fields,
  context,
  onUnknownBlock,
}: RenderBlocksProps): JSX.Element | null {
  if (!blocks || blocks.length === 0) return null

  return (
    <>
      {blocks.map((block, index) => {
        const Component = registry[block.blockType]
        const contractFields = fields[block.blockType]

        if (!Component || !contractFields) {
          return (
            <Fragment key={block.id ?? index}>
              {onUnknownBlock?.(block.blockType) ?? null}
            </Fragment>
          )
        }

        const props = coerceBlock(block.blockType, contractFields, block, context)
        return <Component key={block.id ?? index} {...props} />
      })}
    </>
  )
}
