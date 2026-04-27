import type { AllowedDestination, FormsPluginOptions } from './options.js'

export interface DestinationLookupResult {
  ok: boolean
  destination?: AllowedDestination
  reason?: string
}

/**
 * Validates a label against the configured allowlist. Used by the create/
 * update tools, by the collection's beforeChange hook (the secondary
 * defense if MCP is bypassed), and by the fan-out worker (the tertiary
 * defense if a stored row references a label that has since been removed
 * from the allowlist by a redeploy).
 */
export function validateDestinationLabel(
  options: FormsPluginOptions,
  label: string,
): DestinationLookupResult {
  if (!label || typeof label !== 'string') {
    return { ok: false, reason: 'Destination label is required.' }
  }
  const destination = options.allowedDestinations.find((d) => d.label === label)
  if (!destination) {
    return {
      ok: false,
      reason: `Destination "${label}" is not on the allowlist. Available: ${options.allowedDestinations
        .map((d) => `"${d.label}"`)
        .join(', ')}.`,
    }
  }
  return { ok: true, destination }
}

/**
 * Used by the `list_allowed_destinations` MCP tool. Intentionally drops the
 * raw `value` (URL or email address) — Claude doesn't need the destination
 * value to choose a label, and exposing it broadens the prompt-injection
 * surface unnecessarily.
 */
export function listDestinations(options: FormsPluginOptions): Array<{
  label: string
  type: AllowedDestination['type']
  description: string
}> {
  return options.allowedDestinations.map((d) => ({
    label: d.label,
    type: d.type,
    description: d.description,
  }))
}
