/**
 * Minimal mustache-style template renderer. Supports {{variable}} and
 * {{#if variable}}...{{/if}} (with optional {{else}}). No nesting,
 * no helpers. Keeps the CLI dependency-free.
 *
 * Order of operations matters: {{#if}} is processed before {{variable}}
 * so a single pass over the result expands variables that lived inside
 * an `if` block.
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_match, variable: string, truthy: string, falsy: string | undefined) => {
      return isTruthy(data[variable]) ? truthy : (falsy ?? '')
    },
  )

  result = result.replace(/\{\{(\w+)\}\}/g, (_match, variable: string) => {
    const value = data[variable]
    return value == null ? '' : String(value)
  })

  return result
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false
  if (value === false) return false
  if (value === '') return false
  if (value === 0) return false
  return true
}
