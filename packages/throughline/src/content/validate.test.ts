import type { Field, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { validateBlock } from './validate.js'

/*
The validators here stand in for what sanitization attaches: a built-in that
reads `required` and the limits from the options it is handed (Payload merges
the field config into them), and a generator's own.
*/
const builtIn = vi.fn((value: unknown, options: { required?: boolean; maxLength?: number }) => {
  if (options.required && (value === undefined || value === '')) return 'This field is required.'
  if (options.maxLength && typeof value === 'string' && value.length > options.maxLength) {
    return `This value must be shorter than the max length of ${options.maxLength} characters.`
  }
  return true
})

const fields: Field[] = [
  { name: 'blockGuidance', type: 'ui', admin: { components: {} } },
  { name: 'heading', type: 'text', required: true, maxLength: 10, validate: builtIn as never },
  {
    type: 'row',
    fields: [{ name: 'eyebrow', type: 'text', validate: builtIn as never }],
  },
  {
    name: 'cta',
    type: 'group',
    fields: [{ name: 'label', type: 'text', required: true, validate: builtIn as never }],
  },
  {
    name: 'items',
    type: 'array',
    fields: [{ name: 'title', type: 'text', required: true, validate: builtIn as never }],
  },
  {
    name: 'consent',
    type: 'checkbox',
    validate: ((value: unknown, { siblingData }: { siblingData: { cta?: { label?: string } } }) =>
      value === true || !siblingData.cta?.label ? true : 'Consent is needed with a CTA.') as never,
  },
]

const ctx = { data: { title: 'Doc' }, req: {} as PayloadRequest, collection: 'pages', id: 7 }

describe('validateBlock', () => {
  it('passes a block Payload would save', async () => {
    const row = { heading: 'Hi', cta: { label: 'Go' }, items: [{ title: 'One' }], consent: true }
    await expect(validateBlock(fields, row, ctx)).resolves.toEqual([])
  })

  it('reports each problem with a path inside the block, through groups and array rows', async () => {
    const row = { heading: 'Far too long a heading', cta: {}, items: [{ title: 'ok' }, {}] }
    await expect(validateBlock(fields, row, ctx)).resolves.toEqual([
      { path: 'heading', message: expect.stringMatching(/max length of 10/) },
      { path: 'cta.label', message: 'This field is required.' },
      { path: 'items.1.title', message: 'This field is required.' },
    ])
  })

  it('reaches fields inside a row, and hands a validator its siblings and the field config', async () => {
    builtIn.mockClear()
    await validateBlock(fields, { heading: 'Hi', eyebrow: 'x', cta: { label: 'Go' }, consent: false }, ctx)
    expect(builtIn).toHaveBeenCalledWith(
      'x',
      expect.objectContaining({ name: 'eyebrow', siblingData: expect.objectContaining({ heading: 'Hi' }) }),
    )
    expect(builtIn).toHaveBeenCalledWith(
      'Hi',
      expect.objectContaining({ required: true, maxLength: 10, operation: 'update', event: 'submit', data: ctx.data }),
    )
  })

  it("runs a generator's own rule that reads a sibling", async () => {
    const row = { heading: 'Hi', cta: { label: 'Go' }, consent: false }
    await expect(validateBlock(fields, row, ctx)).resolves.toEqual([
      { path: 'consent', message: 'Consent is needed with a CTA.' },
    ])
  })
})
