import {
  componentDisplayName,
  type LoadedManifest,
} from '@forumone/throughline-design-system/contract'

export interface CompositionBlock {
  type: string
  variant?: string
  /**
   * A composed section (forumone-2026#801): a recipe, not a component, so it
   * has no contract here. The publish step checks the recipe itself; this only
   * keeps its place in the order, so every block's index stays right.
   */
  composed?: boolean
}

export interface CompositionInput {
  blocks: CompositionBlock[]
  /**
   * What to call a component in a message. The publish step passes each
   * block's own label — what the editor picked it by, `Image Hero` — and an
   * MCP caller, who speaks in contract names, may pass the name itself.
   * Defaults to the name as the generated blocks label it, `ImageHero` →
   * `Image Hero`. forumone-2026#805.
   */
  label?: ((type: string) => string) | undefined
}

export interface CompositionIssue {
  severity: 'error' | 'warning'
  rule: string
  message: string
  blockIndex?: number
}

export interface CompositionResult {
  valid: boolean
  issues: CompositionIssue[]
}

export interface AntiPatternMatch {
  pattern: string
  why: string
  useInstead?: string | undefined
  blockIndex: number
}

/**
 * Validates a proposed page layout against the design system's composition
 * rules: forbiddenAdjacent, maxPerPage, requiredSiblings, unknown components,
 * unknown variants. Errors block; warnings advise.
 */
export function validateComposition(
  input: CompositionInput,
  manifest: LoadedManifest,
): CompositionResult {
  const issues: CompositionIssue[] = []
  const counts = new Map<string, number>()
  const label = input.label ?? componentDisplayName

  for (let i = 0; i < input.blocks.length; i++) {
    const block = input.blocks[i]
    if (!block || block.composed) continue
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1)

    const contract = manifest.getComponent(block.type)
    if (!contract) {
      issues.push({
        severity: 'error',
        rule: 'unknown-component',
        message: `This block is a type this site no longer has ("${block.type}"). Remove it, or tell a site administrator.`,
        blockIndex: i,
      })
      continue
    }

    /*
    A component placed only `inline` lives inside another one — a Button in a
    hero, a Card in a grid — and on a page by itself it is a fragment of a
    layout with nothing around it. Nothing checked this before.
    */
    const placement = contract.composition.placement
    if (!placement.includes('page') && !placement.includes('section')) {
      issues.push({
        severity: 'error',
        rule: 'placement',
        message: `${label(block.type)} belongs inside another block, not on the page by itself. Remove it, or add it inside a block that holds it.`,
        blockIndex: i,
      })
    }

    if (block.variant && contract.content.variants) {
      const has = contract.content.variants.some((v) => v.name === block.variant)
      if (!has) {
        issues.push({
          severity: 'error',
          rule: 'unknown-variant',
          message: `The "${block.variant}" style isn't available for ${label(block.type)} any more. Choose another style in the block.`,
          blockIndex: i,
        })
      }
    }

    const prev = i > 0 ? input.blocks[i - 1] : undefined
    const next = i < input.blocks.length - 1 ? input.blocks[i + 1] : undefined
    for (const forbidden of contract.composition.forbiddenAdjacent) {
      if (prev?.type === forbidden) {
        issues.push({
          severity: 'error',
          rule: 'forbidden-adjacent',
          message: `${label(block.type)} can't come directly after ${label(forbidden)}. Move one of them, or put another block between them.`,
          blockIndex: i,
        })
      }
      if (next?.type === forbidden) {
        issues.push({
          severity: 'error',
          rule: 'forbidden-adjacent',
          message: `${label(block.type)} can't come directly before ${label(forbidden)}. Move one of them, or put another block between them.`,
          blockIndex: i,
        })
      }
    }
  }

  for (const [type, count] of counts) {
    const contract = manifest.getComponent(type)
    if (!contract) continue

    const max = contract.composition.maxPerPage
    if (max !== null && count > max) {
      issues.push({
        severity: 'error',
        rule: 'max-per-page',
        message: `A page can have only ${max} ${label(type)} block${max === 1 ? '' : 's'}, and this one has ${count}. Remove ${count - max}.`,
      })
    }

    for (const required of contract.composition.requiredSiblings) {
      if (!counts.has(required)) {
        issues.push({
          severity: 'warning',
          rule: 'required-sibling-missing',
          message: `${label(type)} works best with a ${label(required)} block on the same page, and this page has none.`,
        })
      }
    }
  }

  return { valid: issues.every((issue) => issue.severity !== 'error'), issues }
}

/**
 * Surfaces structural anti-patterns inferred from each component's
 * `antiExamples` plus position-aware heuristics. The current rule set is
 * intentionally small and explicit; new rules should be added with care
 * since false positives are worse than missed detections here.
 */
export function findAntiPatterns(
  input: CompositionInput,
  manifest: LoadedManifest,
): AntiPatternMatch[] {
  const matches: AntiPatternMatch[] = []
  const counts = new Map<string, number>()
  for (const block of input.blocks) {
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1)
  }

  for (let i = 0; i < input.blocks.length; i++) {
    const block = input.blocks[i]
    if (!block) continue
    const contract = manifest.getComponent(block.type)
    if (!contract) continue

    const isLast = i === input.blocks.length - 1
    for (const anti of contract.antiExamples) {
      const labelLower = anti.label.toLowerCase()

      const isMultiplePattern = labelLower.includes('multiple') || labelLower.includes('two') || labelLower.includes('stacked')
      if (isMultiplePattern && (counts.get(block.type) ?? 0) > 1) {
        matches.push({
          pattern: anti.label,
          why: anti.why,
          useInstead: anti.useInstead,
          blockIndex: i,
        })
        continue
      }

      const isEndOfPagePattern =
        labelLower.includes('end of') ||
        labelLower.includes('bottom') ||
        labelLower.includes('closer')
      if (isEndOfPagePattern && isLast && contract.composition.placement.includes('page')) {
        matches.push({
          pattern: anti.label,
          why: anti.why,
          useInstead: anti.useInstead,
          blockIndex: i,
        })
      }
    }
  }

  // De-duplicate (same blockIndex + pattern can fire twice if both branches match)
  const seen = new Set<string>()
  return matches.filter((m) => {
    const key = `${m.blockIndex}:${m.pattern}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
