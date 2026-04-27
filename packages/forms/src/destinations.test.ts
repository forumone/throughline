import { describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import type { FormsPluginOptions } from './options.js'
import { listDestinations, validateDestinationLabel } from './destinations.js'

const options: FormsPluginOptions = {
  inngest: {} as unknown as Inngest,
  ipHashSecret: 'a'.repeat(32),
  allowedDestinations: [
    { type: 'email', value: 'team@example.com', label: 'Main inbox', description: 'General' },
    { type: 'webhook', value: 'https://crm.example.com/leads', label: 'CRM', description: 'Leads' },
  ],
}

describe('validateDestinationLabel', () => {
  it('accepts known labels', () => {
    const result = validateDestinationLabel(options, 'Main inbox')
    expect(result.ok).toBe(true)
    expect(result.destination?.value).toBe('team@example.com')
  })

  it('rejects unknown labels and lists what is available', () => {
    const result = validateDestinationLabel(options, 'attacker@evil.com')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not on the allowlist/)
    expect(result.reason).toMatch(/Main inbox/)
    expect(result.reason).toMatch(/CRM/)
  })

  it('rejects empty / non-string labels', () => {
    expect(validateDestinationLabel(options, '').ok).toBe(false)
    expect(validateDestinationLabel(options, undefined as unknown as string).ok).toBe(false)
  })
})

describe('listDestinations', () => {
  it('omits raw values to limit the prompt-injection surface', () => {
    const list = listDestinations(options)
    expect(list).toEqual([
      { label: 'Main inbox', type: 'email', description: 'General' },
      { label: 'CRM', type: 'webhook', description: 'Leads' },
    ])
    for (const item of list) {
      expect(item).not.toHaveProperty('value')
    }
  })
})
