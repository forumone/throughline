import { ManifestSchema } from '@forumone/throughline-design-system/contract'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { attachComponentValidator, makeContext } from '../_test-helpers.js'
import { COMPONENTS_MANIFEST_SYMBOL, compositionStep, hasContent } from './composition.js'

/*
A block with nothing in it does not publish. forumone-2026#832: an empty CTA
went live in every run of the #830 eval, as an empty band.
*/

const base = {
  category: 'cta',
  description: 'A band with a heading, a line of support and one action.',
  intent: 'For the end of a page, where one next step should be impossible to miss.',
  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: [],
  },
  tokens: { consumes: [] },
  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior: 'A heading and a link.',
    contentWarnings: [],
  },
  examples: [{ label: 'Default', intent: 'An action', storyId: 'x--y' }],
  antiExamples: [{ label: 'Several actions', why: 'One per band.' }],
  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}

const manifest = ManifestSchema.parse({
  contractVersion: '1.1.0',
  designSystem: { name: 'ds', version: '1.0.0' },
  tokens: [],
  components: {
    CTA: {
      ...base,
      name: 'CTA',
      content: {
        fields: [
          { name: 'heading', type: 'text', required: false },
          { name: 'ctaLabel', type: 'text', required: false },
          { name: 'ctaHref', type: 'link', required: false },
          { name: 'tone', type: 'select', required: false },
        ],
      },
    },
    Divider: {
      ...base,
      name: 'Divider',
      content: { fields: [{ name: 'tone', type: 'select', required: false }] },
    },
    LatestPosts: {
      ...base,
      name: 'LatestPosts',
      content: { fields: [{ name: 'heading', type: 'text', required: false }] },
      behavior: { ...base.behavior, fetchesData: true },
    },
  },
  build: { timestamp: '2026-10-04T00:00:00.000Z' },
})

async function run(layout: Record<string, unknown>[]) {
  const payload = {} as Payload
  attachComponentValidator(
    payload,
    vi.fn(async () => ({ valid: true, issues: [] })),
  )
  Object.defineProperty(payload, COMPONENTS_MANIFEST_SYMBOL, { value: async () => manifest })
  return compositionStep(makeContext({ payload, document: { layout } }))
}

describe('an empty block', () => {
  it('does not publish, and says which and what to fill', async () => {
    const out = await run([
      { blockType: 'CTA', heading: 'Talk to us' },
      { blockType: 'CTA', tone: 'dark', ctaHref: { mode: 'internal' } },
    ])
    expect(out.pass).toBe(false)
    expect(out.issues).toEqual([
      expect.objectContaining({
        rule: 'empty-block',
        field: 'layout[1]',
        message: expect.stringContaining('heading, ctaLabel, ctaHref'),
      }),
    ])
  })

  it('counts a link with a destination, or any one filled field, as content', async () => {
    expect(
      (await run([{ blockType: 'CTA', ctaHref: { mode: 'external', url: 'https://example.org' } }]))
        .pass,
    ).toBe(true)
    expect(
      (
        await run([
          {
            blockType: 'CTA',
            ctaHref: { mode: 'internal', reference: { relationTo: 'pages', value: 3 } },
          },
        ])
      ).pass,
    ).toBe(true)
  })

  it('leaves alone a block with no content to fill, and one that fetches its own', async () => {
    expect((await run([{ blockType: 'Divider' }, { blockType: 'LatestPosts' }])).pass).toBe(true)
  })
})

describe('hasContent', () => {
  it('reads past settings and bookkeeping to what a reader would see', () => {
    expect(hasContent('  ')).toBe(false)
    expect(hasContent(false)).toBe(false)
    expect(hasContent({ mode: 'external', url: '', newTab: true })).toBe(false)
    expect(hasContent([{ id: 'a', blockType: 'x' }])).toBe(false)
    expect(
      hasContent({
        root: {
          type: 'root',
          children: [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }],
        },
      }),
    ).toBe(false)
    expect(
      hasContent({
        root: {
          type: 'root',
          children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hi' }] }],
        },
      }),
    ).toBe(true)
    expect(hasContent(7)).toBe(true)
  })
})
