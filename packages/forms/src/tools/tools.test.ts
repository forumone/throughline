import { describe, expect, it } from 'vitest'
import {
  createCreateFormTool,
  createGetFormSubmissionsTool,
  createListAllowedDestinationsTool,
  createUpdateFormDestinationsTool,
  createUpdateFormFieldsTool,
  createValidateFormTool,
} from './index.js'
import { createFakePayload, makeContext, makeResolvedConfig } from './_test-helpers.js'

const validField = { blockType: 'email', name: 'email', label: 'Your email', required: true }
const textField = { blockType: 'text', name: 'name', label: 'Your name' }

describe('list_allowed_destinations', () => {
  it('returns the labels and types but never the raw values', async () => {
    const resolved = makeResolvedConfig()
    const tool = createListAllowedDestinationsTool({ options: resolved.options })
    const result = (await tool.handler({}, makeContext())) as {
      destinations: Array<{ label: string; type: string; description: string }>
    }
    expect(result.destinations.map((d) => d.label)).toEqual(['Main inbox', 'CRM'])
    for (const d of result.destinations) expect(d).not.toHaveProperty('value')
  })
})

describe('validate_form', () => {
  it('flags unknown destinations', async () => {
    const resolved = makeResolvedConfig()
    const tool = createValidateFormTool({ options: resolved.options })
    const result = (await tool.handler(
      { fields: [textField], destinationLabels: ['Unknown'] },
      makeContext(),
    )) as { ok: boolean; issues: string[] }
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatch(/not on the allowlist/)
  })

  it('flags submitterConfirmation pointing at non-email field', async () => {
    const resolved = makeResolvedConfig()
    const tool = createValidateFormTool({ options: resolved.options })
    const result = (await tool.handler(
      {
        fields: [textField],
        destinationLabels: ['Main inbox'],
        submitterConfirmation: { enabled: true, emailFieldName: 'name' },
      },
      makeContext(),
    )) as { ok: boolean; issues: string[] }
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatch(/blockType="email"/)
  })

  it('approves a valid form definition', async () => {
    const resolved = makeResolvedConfig()
    const tool = createValidateFormTool({ options: resolved.options })
    const result = (await tool.handler(
      { fields: [textField, validField], destinationLabels: ['Main inbox'] },
      makeContext(),
    )) as { ok: boolean }
    expect(result.ok).toBe(true)
  })
})

describe('create_form', () => {
  it('persists a form, writes audit, and reflects the policy decisions', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload()
    const tool = createCreateFormTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      {
        title: 'Contact us',
        intent: 'Generic contact form for marketing leads',
        fields: [validField, textField],
        destinationLabels: ['Main inbox'],
      },
      makeContext(),
    )) as { formId: string; destinations: string[]; consent: boolean; honeypot: boolean }

    expect(result.formId).toBe('created-1')
    expect(result.destinations).toEqual(['Main inbox'])
    expect(result.consent).toBe(true)
    expect(result.honeypot).toBe(true)

    expect(handle.creates).toHaveLength(1)
    const created = handle.creates[0]!
    expect(created.collection).toBe('forms')
    const policy = (created.data['policy'] ?? {}) as Record<string, unknown>
    expect(policy['privacyNoticeText']).toBe('notice')
    expect(policy['destinations']).toEqual([{ label: 'Main inbox', enabled: true }])
    expect(policy['spamProtection']).toEqual({ honeypot: true, rateLimit: 5 })

    expect(handle.audits).toHaveLength(1)
    expect(handle.audits[0]?.['action']).toBe('form.created')
    expect(handle.audits[0]?.['mcpTool']).toBe('create_form')
  })

  it('refuses unknown destinations', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload()
    const tool = createCreateFormTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      {
        title: 'Contact us',
        intent: 'A form intended for marketing',
        fields: [textField],
        destinationLabels: ['attacker@evil.com'],
      },
      makeContext(),
    )) as { error?: string }
    expect(result.error).toMatch(/not on the allowlist/)
    expect(handle.creates).toHaveLength(0)
  })

  it('rejects callers without admin/editor', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload()
    const tool = createCreateFormTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      {
        title: 'Contact us',
        intent: 'A form intended for marketing',
        fields: [textField],
        destinationLabels: ['Main inbox'],
      },
      makeContext({
        user: { id: 'u', email: 'e', name: 'n', roles: ['author'], groups: [] },
      }),
    )) as { error?: string }
    expect(result.error).toMatch(/admins and editors/)
  })
})

describe('update_form_fields', () => {
  it('updates fields and writes audit', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload({ title: 'Existing', policy: {} })
    const tool = createUpdateFormFieldsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', fields: [textField] },
      makeContext(),
    )) as { ok?: boolean; fieldCount?: number; error?: string }
    expect(result.ok).toBe(true)
    expect(result.fieldCount).toBe(1)
    expect(handle.updates[0]?.collection).toBe('forms')
    expect(handle.audits[0]?.['mcpTool']).toBe('update_form_fields')
  })

  it('refuses if removing a field that submitterConfirmation references', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload({
      title: 'Existing',
      policy: {
        submitterConfirmation: { enabled: true, emailFieldName: 'email' },
      },
    })
    const tool = createUpdateFormFieldsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', fields: [textField] },
      makeContext(),
    )) as { error?: string }
    expect(result.error).toMatch(/submitterConfirmation/)
    expect(handle.updates).toHaveLength(0)
  })
})

describe('update_form_destinations', () => {
  it('replaces destinations and audits the change', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload({ title: 'Existing', policy: { destinations: [] } })
    const tool = createUpdateFormDestinationsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', destinationLabels: ['Main inbox', 'CRM'] },
      makeContext(),
    )) as { ok?: boolean; destinations?: string[] }
    expect(result.ok).toBe(true)
    expect(result.destinations).toEqual(['Main inbox', 'CRM'])
    const updated = handle.updates[0]?.data['policy'] as Record<string, unknown>
    expect(updated['destinations']).toEqual([
      { label: 'Main inbox', enabled: true },
      { label: 'CRM', enabled: true },
    ])
  })

  it('rejects unknown destinations', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload({ title: 'Existing', policy: {} })
    const tool = createUpdateFormDestinationsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', destinationLabels: ['attacker@evil.com'] },
      makeContext(),
    )) as { error?: string }
    expect(result.error).toMatch(/allowlist/)
    expect(handle.updates).toHaveLength(0)
  })

  it('rejects duplicate labels', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload({ title: 'Existing', policy: {} })
    const tool = createUpdateFormDestinationsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', destinationLabels: ['Main inbox', 'Main inbox'] },
      makeContext(),
    )) as { error?: string }
    expect(result.error).toMatch(/Duplicate destination label/)
  })
})

describe('get_form_submissions', () => {
  it('redacts submission data unless includePii=true', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload()
    handle.setSubmissions([
      { id: 's-1', createdAt: '2026-04-22T10:00:00.000Z', submissionData: [{ field: 'email', value: 'x@y' }] },
    ])
    const tool = createGetFormSubmissionsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler({ formId: 'f-1' }, makeContext())) as {
      submissions: Array<{ data: unknown }>
    }
    expect(result.submissions[0]?.data).toMatch(/redacted/)
  })

  it('returns full data when includePii=true and the caller has the role', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload()
    handle.setSubmissions([
      { id: 's-1', createdAt: '2026-04-22T10:00:00.000Z', submissionData: [{ field: 'email', value: 'x@y' }] },
    ])
    const tool = createGetFormSubmissionsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', includePii: true },
      makeContext({
        user: { id: 'u', email: 'e', name: 'n', roles: ['admin'], groups: [] },
      }),
    )) as { submissions: Array<{ data: unknown }> }
    expect(result.submissions[0]?.data).toEqual([{ field: 'email', value: 'x@y' }])
  })

  it('refuses includePii for users without the role', async () => {
    const resolved = makeResolvedConfig()
    const handle = createFakePayload()
    const tool = createGetFormSubmissionsTool({ payload: handle.payload, resolved })
    const result = (await tool.handler(
      { formId: 'f-1', includePii: true },
      makeContext({
        user: { id: 'u', email: 'e', name: 'n', roles: ['editor'], groups: [] },
      }),
    )) as { error?: string }
    expect(result.error).toMatch(/admin or form-admin/)
  })
})
