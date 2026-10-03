/**
 * Layout & container tokens: the max-widths a page constrains to, the
 * horizontal gutter/margins, and the responsive breakpoints. These are the
 * values the "Layout & Containers" foundation documents. Brand projects
 * override them (e.g. Forum One uses constrain 800/1440/2200, gutter 40,
 * breakpoints 320–1400); the reference DS ships neutral defaults.
 */
export const layout = {
  /** Container max-widths the page content constrains to. */
  'layout.container.sm': '40rem', // 640px — narrow prose
  'layout.container.md': '64rem', // 1024px — default content width
  'layout.container.lg': '80rem', // 1280px — wide / full-bleed sections

  /** Horizontal gutter between grid columns. */
  'layout.gutter': '1.5rem', // 24px
  /** Page side margins (inside the viewport, outside the container). */
  'layout.margin': '1rem', // 16px

  /** Responsive breakpoints (min-width). */
  'layout.breakpoint.sm': '40rem', // 640px
  'layout.breakpoint.md': '48rem', // 768px
  'layout.breakpoint.lg': '64rem', // 1024px
  'layout.breakpoint.xl': '80rem', // 1280px
} as const

export type LayoutToken = keyof typeof layout
