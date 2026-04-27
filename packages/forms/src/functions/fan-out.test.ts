import { describe, expect, it } from 'vitest'
import { createFormFanOutFunction } from './fan-out.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'
import { makeResolvedConfig } from '../tools/_test-helpers.js'

describe('createFormFanOutFunction', () => {
  it('subscribes to form/submission.received', () => {
    const fake = createFakeInngest()
    const payload = createFakePayload()
    createFormFanOutFunction({
      inngest: fake.inngest,
      payload: payload.payload,
      resolved: makeResolvedConfig(),
    })
    const triggers = fake.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers).toEqual([{ event: 'form/submission.received' }])
  })

  it('dispatches per-destination events for enabled allowlisted entries', async () => {
    const fake = createFakeInngest()
    const payloadHandle = createFakePayload()
    payloadHandle.setForm({
      title: 'Contact',
      policy: {
        destinations: [
          { label: 'Main inbox', enabled: true },
          { label: 'CRM', enabled: true },
          { label: 'Disabled inbox', enabled: false },
        ],
      },
    })

    createFormFanOutFunction({
      inngest: fake.inngest,
      payload: payloadHandle.payload,
      resolved: makeResolvedConfig(),
    })

    const result = (await fake.invoke('form-fan-out', {
      name: 'form/submission.received',
      data: { formId: 'f-1', submissionId: 's-1' },
    })) as { dispatched: number; submitterConfirmation: boolean }

    expect(result.dispatched).toBe(2)
    expect(result.submitterConfirmation).toBe(false)
    expect(fake.sends).toEqual([
      { name: 'form/destination.email', data: { submissionId: 's-1', formId: 'f-1', destinationLabel: 'Main inbox' } },
      { name: 'form/destination.webhook', data: { submissionId: 's-1', formId: 'f-1', destinationLabel: 'CRM' } },
    ])
  })

  it('drops destinations no longer on the allowlist and logs', async () => {
    const fake = createFakeInngest()
    const payloadHandle = createFakePayload()
    payloadHandle.setForm({
      title: 'Contact',
      policy: {
        destinations: [
          { label: 'Main inbox', enabled: true },
          { label: 'Removed inbox', enabled: true },
        ],
      },
    })

    createFormFanOutFunction({
      inngest: fake.inngest,
      payload: payloadHandle.payload,
      resolved: makeResolvedConfig(),
    })

    const result = (await fake.invoke('form-fan-out', {
      name: 'form/submission.received',
      data: { formId: 'f-1', submissionId: 's-1' },
    })) as { dispatched: number; dropped: number }

    expect(result.dispatched).toBe(1)
    expect(result.dropped).toBe(1)
    expect(fake.sends).toHaveLength(1)
  })

  it('fires form/submitter-confirmation when enabled', async () => {
    const fake = createFakeInngest()
    const payloadHandle = createFakePayload()
    payloadHandle.setForm({
      title: 'Contact',
      policy: {
        destinations: [{ label: 'Main inbox', enabled: true }],
        submitterConfirmation: { enabled: true, emailFieldName: 'email' },
      },
    })

    createFormFanOutFunction({
      inngest: fake.inngest,
      payload: payloadHandle.payload,
      resolved: makeResolvedConfig(),
    })

    await fake.invoke('form-fan-out', {
      name: 'form/submission.received',
      data: { formId: 'f-1', submissionId: 's-1' },
    })

    const confirmation = fake.sends.find((s) => s.name === 'form/submitter-confirmation')
    expect(confirmation).toEqual({
      name: 'form/submitter-confirmation',
      data: { submissionId: 's-1', formId: 'f-1' },
    })
  })

  it('skips when form is missing', async () => {
    const fake = createFakeInngest()
    const payloadHandle = createFakePayload()
    createFormFanOutFunction({
      inngest: fake.inngest,
      payload: payloadHandle.payload,
      resolved: makeResolvedConfig(),
    })
    const result = (await fake.invoke('form-fan-out', {
      name: 'form/submission.received',
      data: { formId: 'gone', submissionId: 's-1' },
    })) as { skipped: boolean }
    expect(result.skipped).toBe(true)
  })
})
