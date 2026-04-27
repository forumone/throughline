import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import { validateOptions, type EmailPluginOptions } from './options.js'

const fakeInngest = {} as unknown as Inngest

const baseOptions: EmailPluginOptions = {
  inngest: fakeInngest,
  apiKey: 'rs-key',
  fromAddress: 'noreply@example.com',
  resolveApprover: async () => null,
  resolveRequester: async () => null,
  buildActionUrl: async () => 'https://example.com/action',
}

describe('validateOptions', () => {
  beforeEach(() => {
    delete process.env['RESEND_API_KEY']
    delete process.env['EMAIL_FROM_ADDRESS']
    delete process.env['EMAIL_FROM_NAME']
    delete process.env['EMAIL_REPLY_TO']
  })

  afterEach(() => {
    delete process.env['RESEND_API_KEY']
    delete process.env['EMAIL_FROM_ADDRESS']
    delete process.env['EMAIL_FROM_NAME']
    delete process.env['EMAIL_REPLY_TO']
  })

  it('passes through a fully-specified options object', () => {
    const result = validateOptions(baseOptions)
    expect(result.env.apiKey).toBe('rs-key')
    expect(result.env.fromAddress).toBe('noreply@example.com')
    expect(result.env.fromName).toBe('Your Site')
    expect(result.env.replyTo).toBeUndefined()
  })

  it('throws when inngest is missing', () => {
    expect(() => validateOptions({ ...baseOptions, inngest: undefined as unknown as Inngest })).toThrow(/Inngest client/)
  })

  it('reads the api key from RESEND_API_KEY when not provided', () => {
    process.env['RESEND_API_KEY'] = 'env-key'
    const { apiKey, ...rest } = baseOptions
    void apiKey
    expect(validateOptions(rest as EmailPluginOptions).env.apiKey).toBe('env-key')
  })

  it('reads the from address from EMAIL_FROM_ADDRESS when not provided', () => {
    process.env['EMAIL_FROM_ADDRESS'] = 'env@example.com'
    const { fromAddress, ...rest } = baseOptions
    void fromAddress
    expect(validateOptions(rest as EmailPluginOptions).env.fromAddress).toBe('env@example.com')
  })

  it('throws when the api key is unavailable from any source', () => {
    const { apiKey, ...rest } = baseOptions
    void apiKey
    expect(() => validateOptions(rest as EmailPluginOptions)).toThrow(/RESEND_API_KEY/)
  })

  it('throws when the from address is unavailable from any source', () => {
    const { fromAddress, ...rest } = baseOptions
    void fromAddress
    process.env['RESEND_API_KEY'] = 'env-key'
    expect(() => validateOptions(rest as EmailPluginOptions)).toThrow(/EMAIL_FROM_ADDRESS/)
  })

  it('requires resolver functions', () => {
    const { resolveApprover, ...rest } = baseOptions
    void resolveApprover
    expect(() => validateOptions(rest as EmailPluginOptions)).toThrow(/resolveApprover/)
  })

  it('requires buildActionUrl', () => {
    const { buildActionUrl, ...rest } = baseOptions
    void buildActionUrl
    expect(() => validateOptions(rest as EmailPluginOptions)).toThrow(/buildActionUrl/)
  })

  it('falls back to tokens.brandName for fromName', () => {
    const result = validateOptions({ ...baseOptions, tokens: { brandName: 'Acme Foundation' } })
    expect(result.env.fromName).toBe('Acme Foundation')
    expect(result.brandName).toBe('Acme Foundation')
  })

  it('prefers EMAIL_FROM_NAME over tokens.brandName', () => {
    process.env['EMAIL_FROM_NAME'] = 'Env Sender'
    const result = validateOptions({ ...baseOptions, tokens: { brandName: 'Acme Foundation' } })
    expect(result.env.fromName).toBe('Env Sender')
  })

  it('captures EMAIL_REPLY_TO when set', () => {
    process.env['EMAIL_REPLY_TO'] = 'support@example.com'
    expect(validateOptions(baseOptions).env.replyTo).toBe('support@example.com')
  })
})
