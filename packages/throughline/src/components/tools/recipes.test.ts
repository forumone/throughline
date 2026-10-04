import { loadManifest } from '@forumone/throughline-design-system/contract'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import { ValidationError, type Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { McpToolContext } from '../../plugin-contract/mcp.js'
import { fakeContext, fixtureLoader } from './_test-helpers.js'
import {
  createGetRecipeVocabularyTool,
  createSaveRecipeTool,
  createValidateRecipeTool,
} from './recipes.js'

/*
The recipe tools (forumone-2026#801), over the reference design system with two
primitives added: what a recipe may use, whether one passes, and saving one.
*/

const loaded = loadManifest({
  ...referenceManifest,
  contractVersion: '1.1.0',
  primitives: {
    Section: {
      name: 'Section',
      kind: 'layout',
      description: 'A full-width band holding a column of content.',
      props: { variant: { type: 'enum', values: ['default', 'dark'] } },
      slots: { children: { description: 'What the band holds.', required: true } },
    },
    Heading: {
      name: 'Heading',
      kind: 'content',
      description: 'A heading from a text field, at level two to four.',
      content: { type: 'text' },
    },
  },
})
const loader = fixtureLoader(loaded)

const recipe = () => ({
  contract: {
    name: 'ProofBand',
    category: 'section',
    description: 'A dark band with one claim, a line of support and a next step.',
    intent: 'For the point on a landing page where one claim needs room of its own, nothing else.',
    composition: { placement: ['section'], maxPerPage: null, requiredSiblings: [], forbiddenAdjacent: [] },
    content: { fields: [{ name: 'heading', type: 'text', required: true }] },
    tokens: { consumes: [] },
    accessibility: { keyboardSupport: [], screenReaderBehavior: 'A heading in a band.', contentWarnings: [] },
    examples: [{ label: 'Default', intent: 'A claim', storyId: 'x--y' }],
    antiExamples: [{ label: 'Many claims', why: 'One per band.' }],
    behavior: { fetchesData: false, hasClientState: false, animates: false, requiresAnalytics: false },
  },
  tree: {
    primitive: 'Section',
    props: { variant: 'dark' },
    slots: { children: [{ primitive: 'Heading', content: { field: 'heading' } }] },
  },
})

const audit = vi.fn(async () => {})
const editor: McpToolContext = { ...fakeContext, user: { ...fakeContext.user!, roles: ['editor'] } }

describe('get_recipe_vocabulary', () => {
  it('lists the primitives with their allowed values, the inline components, and the rules', async () => {
    const out = (await createGetRecipeVocabularyTool({ loader }).handler({}, editor)) as {
      primitives: { name: string }[]
      components: { name: string }[]
      rules: string[]
    }
    expect(out.primitives.map((p) => p.name)).toEqual(['Section', 'Heading'])
    // Card and Divider may sit inline; Hero may not.
    expect(out.components.map((c) => c.name)).toEqual(expect.arrayContaining(['Card', 'Divider']))
    expect(out.components.map((c) => c.name)).not.toContain('Hero')
    expect(out.rules.join(' ')).toMatch(/At most 6 levels deep and 60 nodes/)
  })
})

describe('validate_recipe', () => {
  it('passes a good recipe', async () => {
    const out = await createValidateRecipeTool({ loader, auditWriter: audit }).handler(recipe(), editor)
    expect(out).toEqual({ valid: true, issues: [] })
  })

  it('returns every problem with its path, for the agent to fix and try again', async () => {
    const bad = recipe()
    bad.tree.props.variant = 'neon'
    const out = (await createValidateRecipeTool({ loader, auditWriter: audit }).handler(bad, editor)) as {
      valid: boolean
      issues: { path: string; rule: string }[]
    }
    expect(out.valid).toBe(false)
    expect(out.issues).toEqual([
      expect.objectContaining({ path: 'tree.props.variant', rule: 'props.enum' }),
    ])
  })
})

describe('save_recipe', () => {
  function deps(overrides: { create?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> } = {}) {
    const create =
      overrides.create ?? vi.fn(async () => ({ id: 3, name: 'ProofBand', status: 'draft' }))
    const update = overrides.update ?? vi.fn(async () => ({ id: 3, name: 'ProofBand', status: 'draft' }))
    const payload = { create, update, config: { routes: { admin: '/admin' } } } as unknown as Payload
    return { create, update, tool: createSaveRecipeTool({ payload, loader, auditWriter: audit, collection: 'section-recipes' }) }
  }

  it('saves a draft as the caller, never approving it, and says a person approves it', async () => {
    const { create, tool } = deps()
    const out = await tool.handler({ ...recipe(), _meta: { userPrompt: 'A proof band' } }, editor)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'section-recipes',
        overrideAccess: false,
        user: editor.user,
        data: { contract: recipe().contract, tree: recipe().tree },
      }),
    )
    expect(out).toMatchObject({ id: 3, status: 'draft', next: expect.stringMatching(/A person approves/) })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'content.create', mcpTool: 'save_recipe', targetId: '3' }),
    )
  })

  it('updates a draft by id, respecting locks', async () => {
    const { update, tool } = deps()
    await tool.handler({ ...recipe(), id: 3 }, editor)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 3, overrideLock: false }))
  })

  it('refuses one that does not pass, saving nothing', async () => {
    const { create, tool } = deps()
    const bad = recipe()
    bad.tree.props.variant = 'neon'
    const out = await tool.handler(bad, editor)
    expect(out).toMatchObject({ error: expect.stringMatching(/Nothing was saved/), issues: [expect.any(Object)] })
    expect(create).not.toHaveBeenCalled()
  })

  it('hands back the collection’s refusal, such as for an approved recipe', async () => {
    const update = vi.fn(async () => {
      throw new ValidationError({
        errors: [{ path: 'tree', message: 'This recipe is approved and pages may be showing it, so it does not change.' }],
      })
    })
    const { tool } = deps({ update })
    const out = await tool.handler({ ...recipe(), id: 3 }, editor)
    expect(out).toMatchObject({ fields: [{ field: 'tree', message: expect.stringMatching(/approved/) }] })
  })

  it('refuses a key with nobody behind it, and anyone who is not an editor or admin', async () => {
    const { create, tool } = deps()
    expect(await tool.handler(recipe(), { ...fakeContext, user: null })).toEqual({ error: expect.any(String) })
    expect(
      await tool.handler(recipe(), { ...fakeContext, user: { ...fakeContext.user!, roles: ['approver'] } }),
    ).toEqual({ error: expect.any(String) })
    expect(create).not.toHaveBeenCalled()
  })
})
