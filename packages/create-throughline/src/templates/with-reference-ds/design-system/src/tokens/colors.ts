export const colors = {
  'color.neutral.0': '#FFFFFF',
  'color.neutral.50': '#FAFAFA',
  'color.neutral.100': '#F4F4F5',
  'color.neutral.200': '#E4E4E7',
  'color.neutral.300': '#D4D4D8',
  'color.neutral.400': '#A1A1AA',
  'color.neutral.500': '#71717A',
  'color.neutral.600': '#52525B',
  'color.neutral.700': '#3F3F46',
  'color.neutral.800': '#27272A',
  'color.neutral.900': '#18181B',
  'color.neutral.1000': '#000000',

  'color.brand.primary': '#2563EB',
  'color.brand.primaryHover': '#1D4ED8',
  'color.brand.secondary': '#0891B2',

  'color.text.primary': '#18181B',
  'color.text.secondary': '#52525B',
  'color.text.muted': '#71717A',
  'color.text.inverse': '#FFFFFF',

  'color.bg.primary': '#FFFFFF',
  'color.bg.secondary': '#FAFAFA',
  'color.bg.tertiary': '#F4F4F5',
  'color.bg.inverse': '#18181B',

  'color.border.default': '#E4E4E7',
  'color.border.strong': '#D4D4D8',

  'color.state.success': '#16A34A',
  'color.state.warning': '#CA8A04',
  'color.state.error': '#DC2626',
  'color.state.info': '#2563EB',
} as const

/**
 * Tokens that swap under `prefers-color-scheme: dark`. Keys match the base
 * palette; values replace the light defaults when the media query applies.
 */
export const darkOverrides = {
  'color.text.primary': '#FAFAFA',
  'color.text.secondary': '#A1A1AA',
  'color.text.muted': '#71717A',
  'color.bg.primary': '#18181B',
  'color.bg.secondary': '#27272A',
  'color.bg.tertiary': '#3F3F46',
  'color.bg.inverse': '#FAFAFA',
  'color.border.default': '#3F3F46',
  'color.border.strong': '#52525B',
} as const

export type ColorToken = keyof typeof colors
