import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import type { AllowedDestination, FormsPluginOptions } from './options.js'
import { validateOptions } from './options.js'

const fakeInngest = {} as unknown as Inngest

const validSecret = 'a'.repeat(32)

const goodEmail: AllowedDestination = {
  type: 'email',
  value: 'team@example.com',
  description: 'Main inbox',
  label: 'Main inbox',
}
const goodWebhook: AllowedDestination = {
  type: 'webhook',
  value: 'https://crm.example.com/leads',
  description: 'CRM',
  label: 'CRM',
}

const baseOptions: FormsPluginOptions = {
  inngest: fakeInngest,
  allowedDestinations: [goodEmail],
  ipHashSecret: validSecret,
}

describe('validateOptions', () => {
  beforeEach(() => {
    delete process.env['FORMS_IP_HASH_SECRET']
  })
  afterEach(() => {
    delete process.env['FORMS_IP_HASH_SECRET']
  })

  it('accepts a minimal valid configuration and applies defaults', () => {
    const resolved = validateOptions(baseOptions)
    expect(resolved.formsCollectionSlug).toBe('forms')
    expect(resolved.submissionsCollectionSlug).toBe('form-submissions')
    expect(resolved.routePrefix).toBe('/forms')
    expect(resolved.rateLimit).toBe(5)
    expect(resolved.requireConsentByDefault).toBe(true)
    expect(resolved.destinationLabels).toEqual(['Main inbox'])
  })

  it('throws when inngest is missing', () => {
    expect(() => validateOptions({ ...baseOptions, inngest: undefined as unknown as Inngest })).toThrow(/Inngest client/)
  })

  it('throws when allowedDestinations is empty', () => {
    expect(() => validateOptions({ ...baseOptions, allowedDestinations: [] })).toThrow(/at least one entry/)
  })

  it('throws on duplicate destination labels', () => {
    expect(() =>
      validateOptions({
        ...baseOptions,
        allowedDestinations: [
          goodEmail,
          { ...goodEmail, value: 'other@example.com' },
        ],
      }),
    ).toThrow(/Duplicate destination label/)
  })

  it('rejects email destinations whose value is not an address', () => {
    expect(() =>
      validateOptions({
        ...baseOptions,
        allowedDestinations: [{ ...goodEmail, value: 'no-at-sign' }],
      }),
    ).toThrow(/not a valid address/)
  })

  it('rejects http:// webhook destinations', () => {
    expect(() =>
      validateOptions({
        ...baseOptions,
        allowedDestinations: [{ ...goodWebhook, value: 'http://crm.example.com/leads' }],
      }),
    ).toThrow(/must use https/)
  })

  it('rejects malformed webhook URLs', () => {
    expect(() =>
      validateOptions({
        ...baseOptions,
        allowedDestinations: [{ ...goodWebhook, value: 'not a url' }],
      }),
    ).toThrow(/not a valid URL/)
  })

  it('reads ipHashSecret from env when not provided', () => {
    process.env['FORMS_IP_HASH_SECRET'] = validSecret
    const { ipHashSecret, ...rest } = baseOptions
    void ipHashSecret
    const resolved = validateOptions(rest as FormsPluginOptions)
    expect(resolved.ipHashSecret).toBe(validSecret)
  })

  it('throws when no ipHashSecret is available from any source', () => {
    const { ipHashSecret, ...rest } = baseOptions
    void ipHashSecret
    expect(() => validateOptions(rest as FormsPluginOptions)).toThrow(/FORMS_IP_HASH_SECRET/)
  })

  it('throws when ipHashSecret is too short', () => {
    expect(() => validateOptions({ ...baseOptions, ipHashSecret: 'short' })).toThrow(/32/)
  })

  it('preserves a webhook destination', () => {
    const resolved = validateOptions({
      ...baseOptions,
      allowedDestinations: [goodEmail, goodWebhook],
    })
    expect(resolved.destinationLabels).toEqual(['Main inbox', 'CRM'])
  })

  it('respects routePrefix override', () => {
    expect(validateOptions({ ...baseOptions, routePrefix: '/contact' }).routePrefix).toBe('/contact')
  })
})
