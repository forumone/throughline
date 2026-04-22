import type { Manifest } from './manifest.js'
import type { ComponentContract } from './schema.js'

/**
 * Test fixtures. Not exported from the package entry point; imported by
 * test files only.
 */

export function makeHeroContract(overrides: Partial<ComponentContract> = {}): ComponentContract {
  const base: ComponentContract = {
    name: 'Hero',
    category: 'hero',
    description: 'A page opener component with a headline and optional call-to-action.',
    intent:
      'Used to establish what a page is about within the first viewport. Appropriate for top-level pages that need editorial framing.',
    composition: {
      placement: ['page'],
      maxPerPage: 1,
      requiredSiblings: [],
      forbiddenAdjacent: ['Hero'],
    },
    content: {
      fields: [{ name: 'headline', type: 'text', required: true, maxLength: 80 }],
    },
    tokens: {
      consumes: ['color.brand.primary'],
    },
    accessibility: {
      keyboardSupport: [],
      screenReaderBehavior: 'Headline is announced as h1 by default.',
      contentWarnings: [],
    },
    examples: [{ label: 'Default', intent: 'Standard page opener', storyId: 'hero--default' }],
    antiExamples: [
      { label: 'Stacked heroes', why: 'Breaks the visual rhythm of the page.', useInstead: 'Section' },
    ],
    behavior: {
      fetchesData: false,
      hasClientState: false,
      animates: false,
      requiresAnalytics: false,
    },
  }
  return { ...base, ...overrides }
}

export function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  const hero = makeHeroContract()
  return {
    contractVersion: '1.0.0',
    designSystem: {
      name: 'test-ds',
      version: '0.0.1',
    },
    tokens: [{ name: 'color.brand.primary', value: '#112233', category: 'color' }],
    components: { Hero: hero },
    build: {
      timestamp: '2026-04-22T12:00:00.000Z',
    },
    ...overrides,
  }
}
