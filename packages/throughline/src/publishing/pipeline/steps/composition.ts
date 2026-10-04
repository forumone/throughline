import type { Manifest } from '@forumone/throughline-design-system/contract'
import { lintRecipe } from '@forumone/throughline-design-system/recipes'
import type { CollectionSlug } from 'payload'
import type { RecipeGateOptions } from '../../options.js'
import { PUBLISHING_UNAVAILABLE, TELL_AN_ADMINISTRATOR, plural } from '../../messages.js'
import type { PipelineContext, PipelineIssue, PipelineStep } from '../types.js'
import { blockLabel, fieldConfigFor } from '../where.js'

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
  /** What to call a component in a message. An older validator ignores it. */
  label?: (type: string) => string
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
      reason: PUBLISHING_UNAVAILABLE,
      detail:
        'The composition step requires the components plugin. Register `componentsPlugin` in your Payload config before `publishingPlugin`; both must share the same Payload instance.',
    }
  }

  // Each block named as the editor picked it: its label in this collection's
  // layout field, which is where a host's renamed block shows its new name.
  const config = fieldConfigFor(ctx)
  const result = await validator({ blocks, label: (type) => blockLabel(config, type) })
  const toIssue = (issue: ComponentValidatorResult['issues'][number]): PipelineIssue => {
    const out: PipelineIssue = {
      severity: issue.severity,
      message: issue.message,
      rule: issue.rule,
    }
    if (issue.blockIndex !== undefined) out.field = `${ctx.collection.layoutField}[${issue.blockIndex}]`
    return out
  }
  const errors: PipelineIssue[] = result.issues
    .filter((issue) => issue.severity === 'error')
    .map(toIssue)
  /*
  A warning does not block, and used to be dropped here — so the one rule that
  only warns, a component missing the sibling its contract expects, reached
  nobody (forumone-2026#805). It now rides on the result's `warnings`, which a
  publish reports beside its success.
  */
  const warnings = result.issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => issue.message)
  const carried = warnings.length > 0 ? { warnings } : {}

  if (gate) {
    for (const [index, block] of typed.entries()) {
      if (block.blockType !== gate.blockType) continue
      errors.push(...(await checkComposedSection(ctx, gate, block, index)))
    }
  }

  const manifest = (ctx.payload as unknown as Record<symbol, unknown>)[COMPONENTS_MANIFEST_SYMBOL] as
    | (() => Promise<Manifest>)
    | undefined
  if (manifest) {
    const components = (await manifest()).components
    for (const [index, block] of typed.entries()) {
      if (gate && block.blockType === gate.blockType) continue
      const empty = emptyBlock(components[block.blockType], block)
      if (empty) {
        errors.push({
          severity: 'error',
          rule: 'empty-block',
          message: `This ${blockLabel(config, block.blockType)} block is empty, so it would show as a blank band on the page. Fill it in or remove it.`,
          field: `${ctx.collection.layoutField}[${index}]`,
        })
      }
    }
  }

  if (errors.length > 0) {
    return {
      ...carried,
      pass: false,
      code: 'composition-errors',
      reason: `${plural(errors.length, 'problem')} with the blocks to fix before this can be published.`,
      issues: errors,
      suggestion: 'Each problem below names the block.',
    }
  }

  return { pass: true, ...carried }
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
    return [issue('recipe-missing', 'This section has no recipe chosen. Choose one, or remove the block.')]
  }

  const recipe = (await ctx.payload.findByID({
    collection: gate.collection as CollectionSlug,
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Record<string, unknown> | null
  if (!recipe) {
    return [
      issue(
        'recipe-missing',
        `The recipe this section was built from no longer exists (${id}). Choose another, or remove the block.`,
      ),
    ]
  }

  const name = String(recipe['name'] ?? id)
  const approved = gate.isApproved ? gate.isApproved(recipe) : recipe['status'] === 'approved'
  if (!approved) {
    return [
      issue(
        'recipe-not-approved',
        `This section uses the recipe "${name}", which hasn't been approved. Approve it, or ask someone who can, then publish.`,
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
          `The recipe "${name}" no longer matches the design system, so this section can't be published. Choose another recipe, or ${TELL_AN_ADMINISTRATOR}. (${found.path}: ${found.message})`,
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
      issues.push(
        issue('recipe-content', `"${f.name}" is empty, and the recipe "${name}" needs it. Fill it in.`),
      )
    }
  }
  return issues
}

/*
A block with nothing in it. forumone-2026#832.

A `CTA` with no heading, no label and no link published in every run of the
#830 eval, and rendered as an empty accent band. Since audit 11 no component
supplies default copy, so an empty block is an empty band, never a styled
default — and the fields that would fill it are optional one by one, which no
single required rule can say.

So: a block whose contract has content to fill, every piece of which is
empty. Exempt are a component with no content fields (it draws from settings
alone) and one that fetches its own data (a listing). Settings — a select, a
checkbox, a number — are not content, and do not count either way.
*/
const CONTENT_TYPES = new Set(['text', 'richtext', 'link', 'image', 'video', 'array', 'group'])

/** The empty content fields, when all of them are; otherwise `undefined`. */
export function emptyBlock(
  component: Manifest['components'][string] | undefined,
  block: Record<string, unknown>,
): string[] | undefined {
  if (!component || component.behavior?.fetchesData) return undefined
  const fields = component.content.fields.filter((f) => CONTENT_TYPES.has(f.type))
  if (fields.length === 0) return undefined
  /*
  Every stored field but the contract's settings: a field the site adds to the
  block counts too. A form block's form is a relationship the site adds, not a
  contract field, and a form block with a form chosen and no heading is not
  empty.
  */
  const settings = new Set(
    component.content.fields.filter((f) => !CONTENT_TYPES.has(f.type)).map((f) => f.name),
  )
  const filled = Object.entries(block).some(
    ([key, value]) => !settings.has(key) && !BOOKKEEPING.has(key) && hasContent(value),
  )
  return filled ? undefined : fields.map((f) => f.name)
}

const BOOKKEEPING = new Set(['id', 'blockType', 'blockName', 'mode', 'newTab', 'relationTo', 'type', 'variant', 'version', 'format', 'indent', 'direction'])

/** Whether a value carries anything a reader would see. */
export function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return value.some(hasContent)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, inner]) => !BOOKKEEPING.has(key) && hasContent(inner),
    )
  }
  return false
}
