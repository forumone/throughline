import type { PipelineIssue, PipelineStep } from '../types.js'

/**
 * Symbol the Component Server's plugin (C5) attaches its composition
 * validator to. Keep in sync with the components package.
 */
export const COMPONENTS_VALIDATOR_SYMBOL = Symbol.for(
  '@forumone/throughline/components-validator',
)

interface ComponentValidatorResult {
  valid: boolean
  issues: Array<{
    severity: 'error' | 'warning'
    rule: string
    message: string
    blockIndex?: number
  }>
}

type ComponentValidator = (input: {
  blocks: Array<{ type: string; variant?: string }>
}) => Promise<ComponentValidatorResult> | ComponentValidatorResult

interface LayoutBlock {
  blockType?: unknown
  variant?: unknown
}

/**
 * Validates a document's layout blocks via the Component Server's validator
 * (attached to the Payload instance by `componentsPlugin`'s `onInit`). Empty
 * layouts pass automatically. Composition warnings don't block publish; only
 * errors do.
 */
export const compositionStep: PipelineStep = async (ctx) => {
  const layoutValue = ctx.document[ctx.collection.layoutField]
  if (!Array.isArray(layoutValue) || layoutValue.length === 0) {
    return { pass: true }
  }

  const blocks = (layoutValue as LayoutBlock[])
    .map((block) => {
      const type = block?.blockType
      const variant = block?.variant
      if (typeof type !== 'string') return null
      return typeof variant === 'string'
        ? { type, variant }
        : { type }
    })
    .filter((b): b is { type: string; variant?: string } => b !== null)

  if (blocks.length === 0) return { pass: true }

  const validator = (ctx.payload as unknown as Record<symbol, unknown>)[
    COMPONENTS_VALIDATOR_SYMBOL
  ] as ComponentValidator | undefined

  if (!validator) {
    return {
      pass: false,
      code: 'components-server-missing',
      reason:
        'Composition step requires the components plugin to be registered before publishingPlugin',
      suggestion:
        'Register `componentsPlugin` in your Payload config before `publishingPlugin`. Both must share the same Payload instance.',
    }
  }

  const result = await validator({ blocks })
  const errors: PipelineIssue[] = result.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => {
      const out: PipelineIssue = {
        severity: 'error',
        message: issue.message,
        rule: issue.rule,
      }
      if (issue.blockIndex !== undefined) out.field = `${ctx.collection.layoutField}[${issue.blockIndex}]`
      return out
    })

  if (errors.length > 0) {
    return {
      pass: false,
      code: 'composition-errors',
      reason: `${errors.length} composition error${errors.length === 1 ? '' : 's'}`,
      issues: errors,
      suggestion:
        'Fix the composition errors. Common causes: duplicate Heroes, forbidden adjacent blocks, or unknown component types.',
    }
  }

  return { pass: true }
}
