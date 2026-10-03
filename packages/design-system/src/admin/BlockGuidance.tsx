'use client'

export interface BlockGuidanceProps {
  /** The sentence to show — see `../generate/guidance.ts`. Injected via `clientProps`. */
  text: string
}

/**
 * The line at the head of an opened block saying what the block is for.
 *
 * A `ui` field, so it stores nothing and appears in no generated type. Drawn
 * with Payload's own description class, so it reads as help text rather than
 * as a field.
 */
export function BlockGuidance({ text }: BlockGuidanceProps) {
  return (
    <p className="field-description" style={{ margin: '0 0 calc(var(--base) * 0.75)' }}>
      {text}
    </p>
  )
}
