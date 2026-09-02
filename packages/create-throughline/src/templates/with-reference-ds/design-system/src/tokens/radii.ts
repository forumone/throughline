export const radii = {
  'radius.none': '0',
  'radius.sm': '0.25rem',
  'radius.md': '0.375rem',
  'radius.lg': '0.5rem',
  'radius.xl': '0.75rem',
  'radius.2xl': '1rem',
  'radius.full': '9999px',
} as const

export type RadiusToken = keyof typeof radii
