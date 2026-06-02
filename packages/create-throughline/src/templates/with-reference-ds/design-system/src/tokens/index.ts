import { colors, darkOverrides } from './colors.js'
import { typography } from './typography.js'
import { spacing } from './spacing.js'
import { radii } from './radii.js'
import { layout } from './layout.js'

export { colors, darkOverrides, typography, spacing, radii, layout }
export type { ColorToken } from './colors.js'
export type { TypographyToken } from './typography.js'
export type { SpacingToken } from './spacing.js'
export type { RadiusToken } from './radii.js'
export type { LayoutToken } from './layout.js'

export const allTokens = {
  ...colors,
  ...typography,
  ...spacing,
  ...radii,
  ...layout,
} as const

export type TokenName = keyof typeof allTokens

/** Returns every token in the shape the design-contract manifest expects. */
export function getTokenList() {
  const categorize = (name: string) => name.split('.')[0] ?? 'other'
  return Object.entries(allTokens).map(([name, value]) => ({
    name,
    value,
    category: categorize(name),
  }))
}
