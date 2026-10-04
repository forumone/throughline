import type { Manifest } from '@forumone/throughline-design-system/contract'
import { lintRecipe } from '@forumone/throughline-design-system/recipes'
import type { CollectionSlug } from 'payload'
import type { RecipeGateOptions } from '../../options.js'
import type { PipelineContext, PipelineIssue, PipelineStep } from '../types.js'

/**
 * Symbol the Component Server's plugin (C5) attaches its composition
 * validator to. Keep in sync with the components package.
 */
export const COMPONENTS_VALIDATOR_SYMBOL = Symbol.for(
  '@forumone/throughline/components-validator',
)

/** Where the components plugin attaches its loaded manifest. Keep in sync with it. */
export const COMPONENTS_MANIFEST_SYMBOL = Symbol.for('@forumone/throughline/components-manifest')

interface ComponentValidatorResult {
  valid: boolean
  issues: Array<{
    severity: 'error' | 'warning'
    rule: string
    message: string
    blockIndex?: number
  }>
}

interface ValidatorBlock {
  type: string
  variant?: string
  composed?: boolean
}

type ComponentValidator = (input: {
  blocks: ValidatorBlock[]
}) => Promise<ComponentValidatorResult> | ComponentValidatorResult

interface LayoutBlock {
  blockType?: unknown
  variant?: unknown
  [key: string]: unknown
}

/**
 * Validates a document's layout blocks via the Component Server's validator
 * (attached to the Payload instance by `componentsPlugin`'s `onInit`). Empty
 * layouts pass automatically. Composition warnings don't block publish; only
 * errors do.
 *
 * With `recipes` configured, a composed section is checked as a recipe rather
 * than as a component — see {@link checkComposedSection}.
 */
export const compositionStep: PipelineStep = async (ctx) => {
  const layoutValue = ctx.document[ctx.collection.layoutField]
  if (!Array.isArray(layoutValue) || layoutValue.length === 0) {
    return { pass: true }
  }

  const gate = ctx.options.recipes
  const typed = (layoutValue as LayoutBlock[]).filter(
    (block): block is LayoutBlock & { blockType: string } => typeof block?.blockType === 'string',
  )
  if (typed.length === 0) return { pass: true }

  const blocks: ValidatorBlock[] = typed.map((block) => {
    if (gate && block.blockType === gate.blockType) return { type: block.blockType, composed: true }
    return typeof block.variant === 'string'
      ? { type: block.blockType, variant: block.variant }
      : { type: block.blockType }
  })

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

  if (gate) {
    for (const [index, block] of typed.entries()) {
      if (block.blockType !== gate.blockType) continue
      errors.push(...(await checkComposedSection(ctx, gate, block, index)))
    }
  }

  if (errors.length > 0) {
    return {
      pass: false,
      code: 'composition-errors',
      reason: `${errors.length} composition error${errors.length === 1 ? '' : 's'}`,
      issues: errors,
      suggestion:
        'Fix the composition errors. Common causes: duplicate Heroes, forbidden adjacent blocks, unknown component types, or a composed section whose recipe is not approved.',
    }
  }

  return { pass: true }
}

/*
A composed section may publish only when its recipe would pass review today
(forumone-2026#801):

- **it exists** — a block whose recipe was deleted renders nothing;
- **a person approved it** — the recipe is the thing nobody reviewed as code;
- **it still lints against the manifest as it is now**, not as it was when it
  was saved — a token renamed or a component removed since is caught here
  rather than on the page;
- **the block fills the recipe's required fields** — an empty heading is an
  empty `<h2>`.

Read past access control: the question is about the recipe, not about what the
publisher may see, and a draft recipe must fail for not being approved rather
than pass for not being found.
*/
async function checkComposedSection(
  ctx: PipelineContext,
  gate: RecipeGateOptions,
  block: LayoutBlock,
  index: number,
): Promise<PipelineIssue[]> {
  const field = `${ctx.collection.layoutField}[${index}]`
  const issue = (rule: string, message: string): PipelineIssue => ({
    severity: 'error',
    rule,
    message,
    field,
  })

  const reference = block[gate.recipeField ?? 'recipe']
  const id =
    reference && typeof reference === 'object' ? (reference as { id?: unknown }).id : reference
  if (typeof id !== 'string' && typeof id !== 'number') {
    return [issue('recipe-missing', 'This composed section has no recipe.')]
  }

  const recipe = (await ctx.payload.findByID({
    collection: gate.collection as CollectionSlug,
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Record<string, unknown> | null
  if (!recipe) {
    return [issue('recipe-missing', `The recipe this composed section uses (${id}) no longer exists.`)]
  }

  const name = String(recipe['name'] ?? id)
  const approved = gate.isApproved ? gate.isApproved(recipe) : recipe['status'] === 'approved'
  if (!approved) {
    return [
      issue(
        'recipe-not-approved',
        `The composed section uses the recipe "${name}", which has not been approved. Approve it in the admin, then publish.`,
      ),
    ]
  }

  const issues: PipelineIssue[] = []
  const manifest = (ctx.payload as unknown as Record<symbol, unknown>)[
    COMPONENTS_MANIFEST_SYMBOL
  ] as (() => Promise<Manifest>) | undefined
  if (manifest) {
    const lint = lintRecipe({ contract: recipe['contract'], tree: recipe['tree'] }, await manifest())
    for (const found of lint.filter((l) => l.severity === 'error')) {
      issues.push(
        issue(
          'recipe-lint',
          `The recipe "${name}" no longer passes against the design system: ${found.path}: ${found.message}`,
        ),
      )
    }
  }

  const fields =
    (recipe['contract'] as { content?: { fields?: { name: string; required?: boolean }[] } } | undefined)
      ?.content?.fields ?? []
  const content = (block[gate.contentField ?? 'content'] ?? {}) as Record<string, unknown>
  for (const f of fields) {
    const value = content[f.name]
    if (f.required && (value === undefined || value === null || value === '')) {
      issues.push(issue('recipe-content', `"${f.name}" is required by the recipe "${name}" and is empty.`))
    }
  }
  return issues
}
