# Phase C3 — Reference Design System

## Goal

Build `@forumone/claude-cms-reference-ds` — a competent, brand-neutral design system with 10-12 components, full contracts, a generated manifest, Storybook deployment, and CI validation. It serves three roles: test fixture for core development, demonstration of what contract compliance looks like, and starting template for client projects without their own design system.

## Prerequisites

- C0 complete; monorepo and publishing pipeline operational
- C2 complete; design contract package published and importable

## Context

The reference DS is the first "real" package in core. Every choice here creates expectations for what contract-compliant design systems look like. Get it right and every future DS (Forum One ADS, future clients) has a clear template. Get it wrong and every DS fights against conventions that don't fit.

The brief is specific: **competent, not minimal, not opinionated**. That means:

- 10-12 components covering the common editorial surface (hero, section, card, media, CTA, prose, stats, FAQ, plus a few utilities)
- Looks fine out of the box — a site using only these components should be publishable, not embarrassing
- Themeable via CSS variables so clients can change colors, typography, and spacing without modifying component code
- Accessibility-first — WCAG 2.1 AA compliant by default, proper heading hierarchy, keyboard navigation, screen reader support
- Neutral brand — Inter for typography (readable, free, widely available), a restrained neutral palette with one accent color, no decorative flourishes

The reference DS is NOT:

- A replacement for client-specific design systems (it's a starting point, not a destination)
- A comprehensive component library (no tables, no data grids, no complex form widgets)
- A prescription for visual design (clients should feel free to replace the entire visual language)

The contract is what persists across DSes. The visual design is disposable.

## Tasks

### C3.1 — Scaffold the package

Create `packages/reference-ds/`:

```
packages/reference-ds/
├── src/
│   ├── components/
│   │   ├── Hero/
│   │   ├── SectionIntro/
│   │   ├── Prose/
│   │   ├── MediaBlock/
│   │   ├── Card/
│   │   ├── CardGrid/
│   │   ├── CTASection/
│   │   ├── Stats/
│   │   ├── FAQ/
│   │   ├── Quote/
│   │   ├── Divider/
│   │   └── Spacer/
│   ├── tokens/
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   ├── radii.ts
│   │   └── index.ts
│   ├── styles/
│   │   ├── reset.css
│   │   ├── tokens.css
│   │   └── base.css
│   ├── lib/
│   │   └── cn.ts
│   └── index.ts
├── scripts/
│   └── build-manifest.ts
├── stories/
├── dist/
├── .storybook/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-reference-ds",
  "version": "0.1.0",
  "description": "A competent, brand-neutral design system demonstrating contract compliance for the Claude-First CMS.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./manifest": "./dist/manifest.json",
    "./styles.css": "./dist/styles.css",
    "./tokens": {
      "types": "./dist/tokens/index.d.ts",
      "default": "./dist/tokens/index.js"
    }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b && pnpm build:styles && pnpm build:manifest",
    "build:styles": "postcss src/styles/*.css --dir dist --base src/styles",
    "build:manifest": "tsx scripts/build-manifest.ts",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-design-contract": "workspace:*",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "@storybook/react-vite": "^8.4.0",
    "@storybook/addon-essentials": "^8.4.0",
    "@storybook/addon-a11y": "^8.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "postcss": "^8.4.0",
    "postcss-cli": "^11.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "storybook": "^8.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### C3.2 — Author the token system

`src/tokens/colors.ts`:

```typescript
/**
 * Neutral palette. Clients override via CSS variables; these are the defaults.
 */
export const colors = {
  // Neutrals
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

  // Brand (single accent, deliberately neutral)
  'color.brand.primary': '#2563EB',
  'color.brand.primaryHover': '#1D4ED8',
  'color.brand.secondary': '#0891B2',

  // Semantic
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

export type ColorToken = keyof typeof colors
```

`src/tokens/typography.ts`:

```typescript
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
```

`src/tokens/spacing.ts`:

```typescript
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
  'spacing.section': '5rem',      // semantic: section padding
  'spacing.container': '1.5rem',  // semantic: container gutter
} as const

export type SpacingToken = keyof typeof spacing
```

`src/tokens/radii.ts`:

```typescript
export const radii = {
  'radius.none': '0',
  'radius.sm': '0.25rem',
  'radius.md': '0.375rem',
  'radius.lg': '0.5rem',
  'radius.xl': '0.75rem',
  'radius.2xl': '1rem',
  'radius.full': '9999px',
} as const

export type RadiiToken = keyof typeof radii
```

`src/tokens/index.ts`:

```typescript
import { colors } from './colors'
import { typography } from './typography'
import { spacing } from './spacing'
import { radii } from './radii'

export { colors, typography, spacing, radii }

export const allTokens = {
  ...colors,
  ...typography,
  ...spacing,
  ...radii,
} as const

export type TokenName = keyof typeof allTokens

/**
 * Returns every token in the format the manifest expects.
 */
export function getTokenList() {
  const categorize = (name: string) => name.split('.')[0] ?? 'other'
  return Object.entries(allTokens).map(([name, value]) => ({
    name,
    value,
    category: categorize(name),
  }))
}
```

### C3.3 — Build the CSS layer

`src/styles/tokens.css` — exposes every token as a CSS variable. Clients override these variables to rebrand without touching component code.

```css
:root {
  /* Colors */
  --color-neutral-0: #FFFFFF;
  --color-neutral-50: #FAFAFA;
  --color-neutral-100: #F4F4F5;
  /* ... one line per token ... */

  --color-brand-primary: #2563EB;
  --color-brand-primaryHover: #1D4ED8;
  --color-brand-secondary: #0891B2;

  --color-text-primary: #18181B;
  --color-text-secondary: #52525B;

  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #FAFAFA;

  --color-border-default: #E4E4E7;

  /* Typography */
  --font-family-sans: Inter, system-ui, -apple-system, sans-serif;
  --font-size-base: 1rem;
  /* ... one line per token ... */

  /* Spacing */
  --spacing-section: 5rem;
  --spacing-container: 1.5rem;
  /* ... one line per token ... */

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  /* ... */
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text-primary: #FAFAFA;
    --color-text-secondary: #A1A1AA;
    --color-bg-primary: #18181B;
    --color-bg-secondary: #27272A;
    --color-border-default: #3F3F46;
  }
}
```

Generate this file from the token modules via a small build script rather than hand-writing it. The script lives at `scripts/build-tokens-css.ts`. Running `pnpm build` should regenerate tokens.css if tokens change.

`src/styles/reset.css` — a minimal reset based on modern-normalize or Eric Meyer's reset, extended with sensible defaults (`box-sizing: border-box`, fluid typography, accessible focus rings).

`src/styles/base.css` — base element styles. Typography scale, body defaults, link styling, heading hierarchy.

### C3.4 — Build the components

Each component follows the same structure:

```
src/components/<Name>/
├── <Name>.tsx           # React component
├── <Name>.stories.tsx   # Storybook stories
├── <Name>.contract.ts   # Contract satisfying the schema
├── <Name>.test.tsx      # Unit tests
├── <Name>.module.css    # Component styles (CSS Modules)
└── index.ts             # Re-exports
```

Build these components:

1. **Hero** — page opener with eyebrow, headline, body, CTA, optional media, three variants (default, compact, split)
2. **SectionIntro** — secondary section opener, h2 level, less prominent than Hero
3. **Prose** — rich text container with proper typography hierarchy for articles and long-form content
4. **MediaBlock** — full-width image or video with optional caption, aspect ratio variants
5. **Card** — single content card with image, headline, description, link
6. **CardGrid** — container for 2-4 column layouts of Cards with responsive reflow
7. **CTASection** — page-bottom call-to-action with headline, supporting text, primary button, optional secondary button
8. **Stats** — numerical data display with 2-4 stats, each with value and label
9. **FAQ** — accordion-style Q&A list with keyboard accessibility
10. **Quote** — pullquote or testimonial with attribution and optional image
11. **Divider** — visual separator, utility component
12. **Spacer** — explicit vertical spacing control, utility component

Example `src/components/Hero/Hero.tsx`:

```tsx
import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import styles from './Hero.module.css'

export interface HeroProps {
  eyebrow?: string
  headline: string
  body?: string
  cta?: { label: string; url: string }
  secondaryCta?: { label: string; url: string }
  media?: { url: string; alt: string }
  variant?: 'default' | 'compact' | 'split'
  background?: 'primary' | 'secondary' | 'neutral'
  className?: string
}

export function Hero({
  eyebrow,
  headline,
  body,
  cta,
  secondaryCta,
  media,
  variant = 'default',
  background = 'primary',
  className,
}: HeroProps) {
  return (
    <section
      role="banner"
      className={clsx(styles.hero, styles[variant], styles[`bg-${background}`], className)}
    >
      <div className={styles.container}>
        <div className={styles.content}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.headline}>{headline}</h1>
          {body && <p className={styles.body}>{body}</p>}
          {(cta || secondaryCta) && (
            <div className={styles.actions}>
              {cta && (
                <a href={cta.url} className={styles.primaryCta}>
                  {cta.label}
                </a>
              )}
              {secondaryCta && (
                <a href={secondaryCta.url} className={styles.secondaryCta}>
                  {secondaryCta.label}
                </a>
              )}
            </div>
          )}
        </div>
        {variant === 'split' && media && (
          <div className={styles.media}>
            <img src={media.url} alt={media.alt} />
          </div>
        )}
      </div>
    </section>
  )
}
```

`src/components/Hero/Hero.module.css`:

```css
.hero {
  padding: var(--spacing-section) 0;
  position: relative;
}

.bg-primary {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.bg-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.bg-neutral {
  background: var(--color-bg-inverse);
  color: var(--color-text-inverse);
}

.container {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0 var(--spacing-container);
  display: grid;
  gap: var(--spacing-12);
}

.split .container {
  grid-template-columns: 1fr 1fr;
  align-items: center;
}

.compact {
  padding: var(--spacing-16) 0;
}

.content {
  max-width: 42rem;
}

.eyebrow {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-3);
}

.headline {
  font-size: var(--font-size-5xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  letter-spacing: var(--letter-spacing-tight);
  margin-bottom: var(--spacing-6);
}

.body {
  font-size: var(--font-size-xl);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-8);
}

.actions {
  display: flex;
  gap: var(--spacing-4);
  flex-wrap: wrap;
}

.primaryCta,
.secondaryCta {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-3) var(--spacing-6);
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.primaryCta {
  background: var(--color-brand-primary);
  color: var(--color-text-inverse);
}

.primaryCta:hover {
  background: var(--color-brand-primaryHover);
}

.secondaryCta {
  border: 1px solid var(--color-border-strong);
  color: var(--color-text-primary);
}

.secondaryCta:hover {
  background: var(--color-bg-secondary);
}

@media (max-width: 768px) {
  .split .container {
    grid-template-columns: 1fr;
  }

  .headline {
    font-size: var(--font-size-4xl);
  }
}
```

Repeat this pattern for every component. Keep styles minimal but functional. The goal is "this looks fine" not "this looks stunning."

### C3.5 — Author component contracts

For every component, create its contract file. Example `src/components/Hero/Hero.contract.ts`:

```typescript
import type { ComponentContract } from '@forumone/claude-cms-design-contract'

export const contract: ComponentContract = {
  name: 'Hero',
  category: 'hero',
  description: 'A page opener with prominent headline, supporting copy, and primary call to action.',
  intent:
    'Establish what a page is about within the first viewport. Use when the page introduces a new topic, program, or initiative that deserves prominent editorial framing. Typically appears once at the top of a page.',

  composition: {
    placement: ['page'],
    maxPerPage: 1,
    requiredSiblings: [],
    forbiddenAdjacent: ['Hero', 'SectionIntro'],
  },

  content: {
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        required: false,
        maxLength: 40,
        constraints: 'Short kicker label, typically the section or program name',
      },
      {
        name: 'headline',
        type: 'text',
        required: true,
        maxLength: 80,
        constraints: 'Sentence case; avoid all caps; keep scannable',
      },
      {
        name: 'body',
        type: 'text',
        required: false,
        maxLength: 240,
        constraints: 'Two to three sentences that support the headline without repeating it',
      },
      {
        name: 'cta',
        type: 'group',
        required: false,
        of: [
          { name: 'label', type: 'text', required: true, maxLength: 30 },
          { name: 'url', type: 'link', required: true },
        ],
      },
      {
        name: 'secondaryCta',
        type: 'group',
        required: false,
        of: [
          { name: 'label', type: 'text', required: true, maxLength: 30 },
          { name: 'url', type: 'link', required: true },
        ],
      },
      {
        name: 'media',
        type: 'image',
        required: false,
        constraints: 'Required when variant is "split"; otherwise optional',
      },
    ],
    variants: [
      {
        name: 'default',
        description: 'Centered text, no media',
        whenToUse: 'Editorial pages and mission statements where content carries the weight',
      },
      {
        name: 'compact',
        description: 'Reduced vertical padding',
        whenToUse: 'Subpages where the hero is contextual framing rather than primary introduction',
      },
      {
        name: 'split',
        description: 'Text on one side, media on the other',
        whenToUse: 'Program pages or anywhere a single supporting image carries meaning',
      },
    ],
  },

  tokens: {
    consumes: [
      'color.bg.primary',
      'color.bg.secondary',
      'color.bg.inverse',
      'color.text.primary',
      'color.text.secondary',
      'color.text.inverse',
      'color.brand.primary',
      'color.brand.primaryHover',
      'spacing.section',
      'spacing.container',
      'font.size.5xl',
      'font.size.4xl',
      'font.weight.bold',
      'line.height.tight',
    ],
    configurable: [
      {
        prop: 'background',
        tokenGroup: 'color.bg',
        allowedValues: ['primary', 'secondary', 'neutral'],
      },
    ],
  },

  accessibility: {
    role: 'banner',
    keyboardSupport: ['Tab to primary CTA', 'Tab to secondary CTA'],
    screenReaderBehavior:
      'The headline is announced as an h1 element. The eyebrow is read as supplementary text before the headline. Decorative media is treated as presentational.',
    contentWarnings: [
      'Avoid text overlay on busy images',
      'Ensure sufficient color contrast between headline and background',
    ],
  },

  examples: [
    {
      label: 'Program landing page',
      intent: 'Introduce a new fellowship program',
      storyId: 'hero--program-landing',
    },
    {
      label: 'Compact subpage',
      intent: 'Open a secondary page with light framing',
      storyId: 'hero--compact',
    },
    {
      label: 'Split with media',
      intent: 'Open a content page with supporting visual context',
      storyId: 'hero--split',
    },
  ],

  antiExamples: [
    {
      label: 'Multiple heroes on one page',
      why: 'A page should have a single primary opener; multiple heroes flatten hierarchy and confuse screen readers with multiple h1s',
      useInstead: 'Use SectionIntro for secondary section headers',
    },
    {
      label: 'Hero at the bottom of a page',
      why: 'Heroes are editorial openers, not closers',
      useInstead: 'Use CTASection for page-bottom calls to action',
    },
    {
      label: 'Split variant without media',
      why: 'The split layout allocates half the space for media; leaving it empty creates awkward whitespace',
      useInstead: 'Use the default variant when media is not available',
    },
  ],

  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}
```

Author a contract at this level of detail for every component. This takes time. Do it well — the contracts are what make this a reference implementation, not the code.

### C3.6 — Author Storybook stories

For each component, create stories matching the `storyId` values declared in its contract. Example `src/components/Hero/Hero.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Hero } from './Hero'

const meta: Meta<typeof Hero> = {
  title: 'Hero',
  component: Hero,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof Hero>

export const Default: Story = {
  args: {
    headline: 'Build tomorrow, starting today',
    body: 'An opinionated starting point for teams that take content seriously.',
    cta: { label: 'Learn more', url: '#' },
  },
}

export const ProgramLanding: Story = {
  args: {
    eyebrow: 'New program',
    headline: 'Fellowship for climate researchers',
    body: 'A one-year fellowship supporting researchers at the intersection of climate and community resilience.',
    cta: { label: 'Apply now', url: '#' },
    secondaryCta: { label: 'Learn about eligibility', url: '#' },
  },
}

export const Compact: Story = {
  args: {
    variant: 'compact',
    headline: 'About our work',
    body: 'Meet the team and learn how we approach our mission.',
  },
}

export const Split: Story = {
  args: {
    variant: 'split',
    eyebrow: 'Case study',
    headline: 'How we helped a foundation modernize its grant process',
    body: 'A twelve-month engagement that reduced processing time by 60% while improving applicant experience.',
    cta: { label: 'Read the case study', url: '#' },
    media: { url: 'https://placehold.co/800x600', alt: 'Foundation office' },
  },
}
```

The Storybook IDs are generated from the `title` plus the story name: "Hero" + "ProgramLanding" = `hero--program-landing`. Every contract's `storyId` must resolve to a real story.

Set up Storybook configuration:

`.storybook/main.ts`:

```typescript
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/components/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
}

export default config
```

`.storybook/preview.ts`:

```typescript
import type { Preview } from '@storybook/react'
import '../src/styles/reset.css'
import '../src/styles/tokens.css'
import '../src/styles/base.css'

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { element: '#storybook-root', config: {}, options: {}, manual: false },
  },
}

export default preview
```

### C3.7 — Build the manifest generator

`scripts/build-manifest.ts`:

```typescript
import { readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { ManifestSchema, CONTRACT_VERSION } from '@forumone/claude-cms-design-contract'
import { getTokenList } from '../src/tokens/index.js'

async function main() {
  const componentsDir = resolve(__dirname, '../src/components')
  const componentDirs = readdirSync(componentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const components: Record<string, unknown> = {}

  for (const name of componentDirs) {
    const contractPath = join(componentsDir, name, `${name}.contract.ts`)
    try {
      const module = await import(contractPath)
      if (!module.contract) {
        throw new Error(`${name}.contract.ts does not export "contract"`)
      }
      components[name] = module.contract
    } catch (error) {
      console.error(`Failed to load contract for ${name}:`, error)
      process.exit(1)
    }
  }

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    designSystem: {
      name: '@forumone/claude-cms-reference-ds',
      version: require('../package.json').version,
      description:
        'A brand-neutral reference design system demonstrating contract compliance for the Claude-First CMS framework.',
    },
    tokens: getTokenList(),
    components,
    build: {
      timestamp: new Date().toISOString(),
      source: 'scripts/build-manifest.ts',
    },
  }

  const result = ManifestSchema.safeParse(manifest)
  if (!result.success) {
    console.error('Generated manifest failed validation:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }

  const outputDir = resolve(__dirname, '../dist')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(result.data, null, 2))

  console.log(`Manifest built with ${Object.keys(components).length} components`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

Run this as part of the build. It fails the build if any contract is missing or invalid.

### C3.8 — Add CI validation

Create `scripts/validate.ts` — runs the lint rules from the design contract package against the generated manifest:

```typescript
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lintManifest, formatLintIssues } from '@forumone/claude-cms-design-contract/lint'
import manifest from '../dist/manifest.json'

async function main() {
  // Collect available story IDs by scanning Storybook stories
  const storyIds = await collectStoryIds()

  // Collect available token names from the manifest itself
  const tokenNames = new Set(manifest.tokens.map((t: { name: string }) => t.name))

  const issues = lintManifest(manifest as any, {
    availableStoryIds: storyIds,
    availableTokens: tokenNames,
  })

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  if (errors.length > 0) {
    console.error('Manifest has errors:')
    console.error(formatLintIssues(errors))
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.warn('Manifest has warnings:')
    console.warn(formatLintIssues(warnings))
  } else {
    console.log('Manifest is clean.')
  }
}

async function collectStoryIds(): Promise<Set<string>> {
  // Scan stories directories, extract titles + story names, normalize to IDs
  // Implementation: use a small glob + TypeScript AST parse, or just read
  // Storybook's index.json if available. Either approach works.
  // ...
  return new Set()
}

main()
```

Wire into `package.json`:

```json
{
  "scripts": {
    "validate": "tsx scripts/validate.ts"
  }
}
```

Run `validate` as part of CI after `build`.

### C3.9 — Write the index exports

`src/index.ts`:

```typescript
// Components
export { Hero, type HeroProps } from './components/Hero'
export { SectionIntro, type SectionIntroProps } from './components/SectionIntro'
export { Prose, type ProseProps } from './components/Prose'
export { MediaBlock, type MediaBlockProps } from './components/MediaBlock'
export { Card, type CardProps } from './components/Card'
export { CardGrid, type CardGridProps } from './components/CardGrid'
export { CTASection, type CTASectionProps } from './components/CTASection'
export { Stats, type StatsProps } from './components/Stats'
export { FAQ, type FAQProps } from './components/FAQ'
export { Quote, type QuoteProps } from './components/Quote'
export { Divider } from './components/Divider'
export { Spacer, type SpacerProps } from './components/Spacer'

// Tokens
export * as tokens from './tokens'
```

### C3.10 — Deploy Storybook

Deploy Storybook to Vercel as a separate project. The URL becomes `reference-ds.claude-cms.forumone.com` (or similar) and can be linked from the design system's `designSystem.storybookUrl` in the manifest.

Alternatively: host on Chromatic (if Phase 2's visual regression is wanted early for the reference DS).

For Phase 1 of this phase: Vercel is enough. Chromatic can be added in C3 Phase 2 if needed.

### C3.11 — Write the README

`README.md`:

```markdown
# @forumone/claude-cms-reference-ds

A competent, brand-neutral reference design system for the Claude-First CMS framework.

## What this package provides

Twelve components covering the common editorial surface, each with full contract metadata, Storybook stories, and tests. Every component satisfies the `ComponentContract` schema from `@forumone/claude-cms-design-contract`.

Components:
- Hero, SectionIntro — page and section openers
- Prose — long-form content container
- MediaBlock, Quote — content blocks
- Card, CardGrid — card layouts
- CTASection — page-bottom calls to action
- Stats, FAQ — data and help content
- Divider, Spacer — utilities

## Three ways to use this package

**As a starting point.** Clone components into your own design system, customize freely, keep what works.

**As a test fixture.** Core framework packages use this DS to verify their behavior against a realistic design system.

**As a demo.** Stand up a Claude-First CMS in minutes using only these components — useful for prototypes, internal tools, and pitches.

## Installation

```bash
pnpm add @forumone/claude-cms-reference-ds
```

Import styles and components:

```typescript
import '@forumone/claude-cms-reference-ds/styles.css'
import { Hero, CardGrid } from '@forumone/claude-cms-reference-ds'
```

Import the manifest (for the Component Server):

```typescript
import manifest from '@forumone/claude-cms-reference-ds/manifest'
```

## Theming

Every token is exposed as a CSS variable. Override them at the root to rebrand:

```css
:root {
  --color-brand-primary: #7E33FF;
  --color-brand-primaryHover: #6420CC;
  --font-family-sans: "DM Sans", sans-serif;
}
```

See `src/styles/tokens.css` for the full list.

## Storybook

Live Storybook: https://reference-ds.claude-cms.forumone.com

## Authoring your own design system

Use this package as a reference for what a contract-compliant design system looks like. Every component has a `.contract.ts` file; every contract satisfies the schema. Copy the structure, replace the content, and your design system becomes a valid input to the framework.
```

### C3.12 — Add changeset and release

```bash
pnpm changeset
```

Select `@forumone/claude-cms-reference-ds`, choose `minor`, write:

> Initial release. Twelve components with full contracts, Storybook stories, generated manifest, CSS variable theming. Serves as reference implementation for contract compliance, test fixture for core packages, and starting template for client projects.

Commit the changeset. Open PR, merge, wait for the release PR, merge that, verify package lands on npm.

## Acceptance criteria

- [ ] `@forumone/claude-cms-reference-ds` exists with 12 components
- [ ] Every component has: React implementation, CSS Modules styles, Storybook stories, unit tests, contract file
- [ ] Every contract satisfies `ComponentContractSchema` and references real tokens and stories
- [ ] Token system exposes colors, typography, spacing, radii via both TS constants and CSS variables
- [ ] CSS variables support light and dark color schemes via `prefers-color-scheme`
- [ ] `scripts/build-manifest.ts` generates a valid manifest during build
- [ ] `scripts/validate.ts` runs lint rules and fails CI on errors
- [ ] Storybook is configured with a11y addon and builds cleanly
- [ ] Storybook deployment is live (Vercel or Chromatic)
- [ ] Main entry exports all components + types; subpath exports expose manifest and styles
- [ ] Unit tests achieve 80%+ coverage per component
- [ ] Storybook stories include every `storyId` referenced by a contract
- [ ] Package publishes cleanly to npm as 0.1.0

## Notes for Claude Code

- Do not over-design the components visually. "Competent" means a site using these looks acceptable, not beautiful. Reserve visual ambition for real client design systems.
- The contracts are the artifact that matters most. If you run short on time, ship fewer components with great contracts rather than twelve components with mediocre contracts.
- CSS Modules are chosen for isolation without runtime cost. Do not switch to styled-components, emotion, or Tailwind — theming via CSS variables is the deliberate choice because it's what clients can override without understanding any JS tooling.
- The `prefers-color-scheme: dark` handling in `tokens.css` is a nice-to-have, not a requirement. Clients with complex dark mode needs will override the entire token layer. Ship it if straightforward; skip if it adds friction.
- When authoring contracts (C3.5), write them from the perspective of the user prompting Claude. The `intent` field should answer "what is a marketer trying to accomplish when they'd want this component?" — not "what does this component technically do."
- Anti-examples are the single most valuable contract field for Claude's reasoning. Invest in them. Every component should have at least 2-3.
- The manifest generator (C3.7) is a standalone script because it's simpler than bundling manifest generation into the TypeScript build. Don't try to be clever with this.
- Resist the temptation to add components beyond the twelve listed. If a component isn't necessary for "a site using only these components is publishable," it belongs in a real client DS, not the reference.
- Commit after each batch of components (groups of 3-4) plus Storybook setup (C3.6) plus manifest generation (C3.7). The component build is the longest single task in this phase.

## What's next

Phase C4 builds the core plumbing package — `@forumone/claude-cms-core` — which every server package depends on. It contains the audit log, the Inngest client factory, shared types, standard env var handling, and common utilities. After C4 ships, the server packages (C5 through C9) can be developed in parallel by different contributors because they all build on the same foundation.
