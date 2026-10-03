import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Block, Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { generateBlocks, type GeneratedBlock, type ManifestComponent } from '../generate/blocks.js'
import { defaultMismatches } from './contractDefaults.js'
import { describeBlockInvariants } from './describeBlockInvariants.js'
import { checkUntouchedBlocks, untouchedData } from './untouchedBlocks.js'

/*
The helpers, run for real: against the blocks the generator makes from the
reference design system's contracts, which is what a scaffolded site starts
with. Then each broken one at a time, to show they fail when they should.
*/

const here = path.dirname(fileURLToPath(import.meta.url))
const referenceComponents = path.resolve(
  here,
  '../../../create-throughline/reference-ds/src/components',
)

/** The reference design system's contracts, read the way its manifest build reads them. */
async function referenceContracts(): Promise<Record<string, ManifestComponent>> {
  const components: Record<string, ManifestComponent> = {}
  for (const name of (await readdir(referenceComponents)).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue
    const file = path.join(referenceComponents, name, `${name}.contract.ts`)
    const loaded = (await import(pathToFileURL(file).href)) as { contract: ManifestComponent }
    components[name] = loaded.contract
  }
  return components
}

/*
The select options a site resolves from its components' literal union types.
The manifest carries none, so a host supplies them; these are the reference
components' own unions.
*/
const SELECT_OPTIONS: Record<string, readonly string[]> = {
  'Divider.spacing': ['compact', 'default', 'spacious'],
  'Spacer.size': ['xs', 'sm', 'md', 'lg', 'xl'],
  'MediaBlock.media.type': ['image', 'video'],
}

const manifest = { components: await referenceContracts() }

const blocks: GeneratedBlock[] = generateBlocks({
  manifest,
  // A grid of slotted cards: its rows hold another component, not authored
  // fields, so a site renders it from a template or writes the block by hand.
  overrides: { CardGrid: { notABlock: true } },
  mediaCollection: 'media',
  linkCollections: ['pages'],
  resolveSelectOptions: (component, at) => SELECT_OPTIONS[`${component}.${at}`] ?? null,
  resolveNamedOptions: () => null,
})

describeBlockInvariants(blocks, { minBlocks: 10, title: 'the reference design system' })

// The plain `Block[]` a site's registry usually exports, with the manifest
// beside it — the other way of saying where the contracts are.
describeBlockInvariants(
  blocks.map((generated) => generated.block),
  { manifest, minBlocks: 10, title: 'the reference design system, as plain blocks' },
)

const blockNamed = (slug: string): GeneratedBlock => {
  const found = blocks.find((candidate) => candidate.block.slug === slug)
  if (!found) throw new Error(`No generated block ${slug}`)
  return found
}

const fieldsOf = (fields: Field[]): Array<Field & { name: string; defaultValue?: unknown }> =>
  fields.flatMap((field) =>
    'name' in field && typeof field.name === 'string'
      ? [field as Field & { name: string }]
      : 'fields' in field && Array.isArray(field.fields)
        ? fieldsOf(field.fields)
        : [],
  )

describe('the reference blocks', () => {
  /*
  Found by writing this suite. `Divider` takes `decorative = true` — hidden
  from screen readers — and its contract said so only in prose, so the CMS
  generated the box unticked and every divider an author added was announced.
  */
  it('starts Divider decorative, as the component does', () => {
    const decorative = fieldsOf(blockNamed('Divider').block.fields).find(
      (f) => f.name === 'decorative',
    )
    expect(decorative?.type).toBe('checkbox')
    expect(decorative?.defaultValue).toBe(true)
  })

  it('has validates to exercise — optional groups and required links', async () => {
    const data = untouchedData(blockNamed('Hero').block.fields, 'none')
    // An optional group stores an object of its children's defaults, which is
    // the case `allOrNothing` has to read as untouched.
    expect(data.cta).toEqual({ url: { mode: 'internal' } })
    expect(await checkUntouchedBlocks(blocks.map((b) => b.block))).toEqual([])
  })
})

describe('checkUntouchedBlocks', () => {
  /*
  The defect it exists for, reconstructed: a group rule that reads an unticked
  checkbox as "filled in" and demands the text beside it.
  */
  const consentBlock: Block = {
    slug: 'Form',
    fields: [
      {
        name: 'consent',
        type: 'group',
        validate: (value: unknown) => {
          const group = value as { required?: boolean; text?: string } | undefined
          if (group && 'required' in group && !group.text) return 'Consent is invalid'
          return true
        },
        fields: [
          { name: 'required', type: 'checkbox', defaultValue: false },
          { name: 'text', type: 'text' },
        ],
      },
    ],
  }

  it('fails a rule that refuses a block nobody has typed into', async () => {
    expect(await checkUntouchedBlocks([consentBlock])).toEqual([
      { path: 'Form.consent', rows: 'none', result: 'Consent is invalid' },
      { path: 'Form.consent', rows: 'one', result: 'Consent is invalid' },
    ])
  })

  it('fails a rule that refuses an empty row an author added', async () => {
    const rows: Block = {
      slug: 'List',
      fields: [
        {
          name: 'items',
          type: 'array',
          fields: [
            {
              name: 'link',
              type: 'group',
              validate: (value: unknown) => (value ? 'Fill in the link' : true),
              fields: [
                { name: 'mode', type: 'radio', defaultValue: 'internal', options: ['internal'] },
              ],
            },
          ],
        },
      ],
    }
    expect(await checkUntouchedBlocks([rows])).toEqual([
      { path: 'List.items[0].link', rows: 'one', result: 'Fill in the link' },
    ])
  })

  it('fails a validate that reaches for the database on an empty value', async () => {
    const lookup: Block = {
      slug: 'Picker',
      fields: [
        {
          name: 'form',
          type: 'text',
          validate: async (_value: unknown, options: unknown) => {
            const { req } = options as { req: { payload: { findByID: () => Promise<unknown> } } }
            await req.payload.findByID()
            return true as const
          },
        },
      ],
    }
    const [failure] = await checkUntouchedBlocks([lookup])
    expect(failure?.result).toMatch(/payload\.findByID/)
  })
})

describe('defaultMismatches', () => {
  it('fails a checkbox the generator started anywhere but where the contract says', () => {
    const divider = blockNamed('Divider')
    // The generator as it was: every boolean hardcoded false.
    const hardcoded: Block = {
      ...divider.block,
      fields: JSON.parse(
        JSON.stringify(divider.block.fields).replace('"defaultValue":true', '"defaultValue":false'),
      ) as Field[],
    }
    expect(defaultMismatches(hardcoded, divider.component.content.fields)).toEqual([
      expect.objectContaining({ path: 'Divider.decorative', contract: true, generated: false }),
    ])
  })

  it('fails a text field with a string default — copy nobody typed', () => {
    const hero = blockNamed('Hero')
    const seeded: Block = {
      ...hero.block,
      fields: [{ name: 'headline', type: 'text', defaultValue: 'Lorem ipsum' }],
    }
    expect(defaultMismatches(seeded, hero.component.content.fields)).toEqual([
      expect.objectContaining({ path: 'Hero.headline', generated: 'Lorem ipsum' }),
    ])
  })

  it('looks inside groups and array rows', () => {
    const contract = [
      {
        name: 'items',
        type: 'array' as const,
        required: false,
        of: [{ name: 'open', type: 'boolean' as const, required: false, defaultValue: true }],
      },
    ]
    const block: Block = {
      slug: 'Accordion',
      fields: [
        {
          name: 'items',
          type: 'array',
          fields: [{ name: 'open', type: 'checkbox', defaultValue: false }],
        },
      ],
    }
    expect(defaultMismatches(block, contract)).toEqual([
      expect.objectContaining({ path: 'Accordion.items.open' }),
    ])
  })
})
