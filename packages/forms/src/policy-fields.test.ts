import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import { addFormPolicyFields } from './policy-fields.js'

const opts = {
  availableDestinationLabels: ['Main inbox', 'CRM'],
  defaultPrivacyNotice: 'By submitting...',
  requireConsentByDefault: true,
  defaultRateLimit: 5,
}

describe('addFormPolicyFields', () => {
  it('appends a single `policy` group field', () => {
    const base: Field[] = [{ name: 'title', type: 'text' }]
    const result = addFormPolicyFields(base, opts)
    expect(result).toHaveLength(base.length + 1)
    const policy = result[result.length - 1]!
    expect(policy.type).toBe('group')
    expect(policy.name).toBe('policy')
  })

  it('does not mutate the input', () => {
    const base: Field[] = [{ name: 'title', type: 'text' }]
    addFormPolicyFields(base, opts)
    expect(base).toHaveLength(1)
  })

  it('exposes only the configured destination labels as select options', () => {
    const result = addFormPolicyFields([], opts)
    const policyGroup = result[0] as Extract<Field, { name: string; type: 'group'; fields: Field[] }>
    const destinations = policyGroup.fields.find(
      (f): f is Extract<Field, { name: string; type: 'array'; fields: Field[] }> =>
        'name' in f && f.name === 'destinations' && f.type === 'array',
    )!
    const labelField = destinations.fields.find(
      (f): f is Extract<Field, { name: string; type: 'select'; options: unknown }> =>
        'name' in f && f.name === 'label' && f.type === 'select',
    )!
    expect(labelField.options).toEqual([
      { label: 'Main inbox', value: 'Main inbox' },
      { label: 'CRM', value: 'CRM' },
    ])
  })

  it('uses the configured defaults for privacy notice / consent / rate limit', () => {
    const result = addFormPolicyFields([], opts)
    const policy = result[0] as Extract<Field, { name: string; type: 'group'; fields: Field[] }>
    const findField = (name: string): Field | undefined =>
      policy.fields.find((f) => 'name' in f && f.name === name)
    const findGroupField = (groupName: string, name: string): Field | undefined => {
      const group = policy.fields.find(
        (f): f is Extract<Field, { name: string; type: 'group'; fields: Field[] }> =>
          'name' in f && f.name === groupName && f.type === 'group',
      )
      return group?.fields.find((f) => 'name' in f && f.name === name)
    }
    const privacy = findField('privacyNoticeText') as { defaultValue: string }
    expect(privacy.defaultValue).toBe('By submitting...')
    const consent = findField('requiresExplicitConsent') as { defaultValue: boolean }
    expect(consent.defaultValue).toBe(true)
    const rateLimit = findGroupField('spamProtection', 'rateLimit') as { defaultValue: number }
    expect(rateLimit.defaultValue).toBe(5)
  })
})
