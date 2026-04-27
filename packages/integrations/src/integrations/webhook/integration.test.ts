import { describe, expect, it } from 'vitest'
import { webhookIntegration } from './index.js'

describe('webhookIntegration.validateConfig', () => {
  const validSecret = 'a'.repeat(32)

  it('accepts a complete, valid config', async () => {
    const result = await webhookIntegration.validateConfig({
      targetUrl: 'https://example.com/hook',
      signingSecret: validSecret,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects missing targetUrl', async () => {
    const result = await webhookIntegration.validateConfig({
      targetUrl: '',
      signingSecret: validSecret,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/targetUrl is required/)
  })

  it('rejects http:// targets', async () => {
    const result = await webhookIntegration.validateConfig({
      targetUrl: 'http://example.com/hook',
      signingSecret: validSecret,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/https/)
  })

  it('rejects malformed URLs', async () => {
    const result = await webhookIntegration.validateConfig({
      targetUrl: 'not a url',
      signingSecret: validSecret,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/valid URL/)
  })

  it('rejects short signing secrets', async () => {
    const result = await webhookIntegration.validateConfig({
      targetUrl: 'https://example.com',
      signingSecret: 'short',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/at least 32 characters/)
  })

  it('rejects non-positive timeoutSeconds', async () => {
    const result = await webhookIntegration.validateConfig({
      targetUrl: 'https://example.com',
      signingSecret: validSecret,
      timeoutSeconds: 0,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/positive/)
  })
})

describe('webhookIntegration metadata', () => {
  it('declares its identity correctly', () => {
    expect(webhookIntegration.id).toBe('webhook')
    expect(webhookIntegration.category).toBe('webhook')
    expect(webhookIntegration.subscribes.length).toBeGreaterThan(0)
    expect(webhookIntegration.healthcheck).toBeTypeOf('function')
  })
})
