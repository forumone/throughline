import type { LoadedManifest } from '@forumone/throughline-design-contract'

export interface CompositionBlock {
  type: string
  variant?: string
}

export interface CompositionInput {
  blocks: CompositionBlock[]
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

  for (let i = 0; i < input.blocks.length; i++) {
    const block = input.blocks[i]
    if (!block) continue
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1)

    const contract = manifest.getComponent(block.type)
    if (!contract) {
      issues.push({
        severity: 'error',
        rule: 'unknown-component',
        message: `Unknown component "${block.type}". Not present in the design system.`,
        blockIndex: i,
      })
      continue
    }

    if (block.variant && contract.content.variants) {
      const has = contract.content.variants.some((v) => v.name === block.variant)
      if (!has) {
        issues.push({
          severity: 'error',
          rule: 'unknown-variant',
          message: `Component "${block.type}" does not have variant "${block.variant}"`,
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
          message: `"${block.type}" cannot appear directly after "${forbidden}"`,
          blockIndex: i,
        })
      }
      if (next?.type === forbidden) {
        issues.push({
          severity: 'error',
          rule: 'forbidden-adjacent',
          message: `"${block.type}" cannot appear directly before "${forbidden}"`,
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
        message: `Component "${type}" appears ${count} times but the maximum allowed is ${max}`,
      })
    }

    for (const required of contract.composition.requiredSiblings) {
      if (!counts.has(required)) {
        issues.push({
          severity: 'warning',
          rule: 'required-sibling-missing',
          message: `Component "${type}" expects a sibling "${required}" but none is present`,
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
