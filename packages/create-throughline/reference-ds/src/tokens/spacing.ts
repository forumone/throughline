export const spacing = {
  'spacing.0': '0',
  'spacing.px': '1px',
  'spacing.0.5': '0.125rem',
  'spacing.1': '0.25rem',
  'spacing.2': '0.5rem',
  'spacing.3': '0.75rem',
  'spacing.4': '1rem',
  'spacing.5': '1.25rem',
  'spacing.6': '1.5rem',
  'spacing.8': '2rem',
  'spacing.10': '2.5rem',
  'spacing.12': '3rem',
  'spacing.16': '4rem',
  'spacing.20': '5rem',
  'spacing.24': '6rem',
  'spacing.32': '8rem',
  'spacing.40': '10rem',
  'spacing.48': '12rem',
  /** Semantic: default vertical padding inside a page section. */
  'spacing.section': '5rem',
  /** Semantic: horizontal gutter inside the page container. */
  'spacing.container': '1.5rem',
} as const

export type SpacingToken = keyof typeof spacing
