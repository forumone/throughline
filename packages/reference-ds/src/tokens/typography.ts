export const typography = {
  'font.family.sans': 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  'font.family.mono': 'ui-monospace, "SF Mono", Monaco, Consolas, monospace',

  'font.size.xs': '0.75rem',
  'font.size.sm': '0.875rem',
  'font.size.base': '1rem',
  'font.size.lg': '1.125rem',
  'font.size.xl': '1.25rem',
  'font.size.2xl': '1.5rem',
  'font.size.3xl': '1.875rem',
  'font.size.4xl': '2.25rem',
  'font.size.5xl': '3rem',
  'font.size.6xl': '3.75rem',

  'font.weight.normal': '400',
  'font.weight.medium': '500',
  'font.weight.semibold': '600',
  'font.weight.bold': '700',

  'line.height.tight': '1.15',
  'line.height.snug': '1.3',
  'line.height.normal': '1.5',
  'line.height.relaxed': '1.65',
  'line.height.loose': '1.8',

  'letter.spacing.tight': '-0.025em',
  'letter.spacing.normal': '0',
  'letter.spacing.wide': '0.025em',
} as const

export type TypographyToken = keyof typeof typography
