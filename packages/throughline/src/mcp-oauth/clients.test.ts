import { describe, expect, it } from 'vitest'
import { classifyRedirects, clientKindFor, isLoopback, redirectRegistered } from './clients.js'

describe('clientKindFor', () => {
  it('knows each app by its callback', () => {
    expect(clientKindFor('https://claude.ai/api/mcp/auth_callback')).toBe('claude')
    expect(clientKindFor('http://localhost:53682/callback')).toBe('claudeCode')
    expect(clientKindFor('http://127.0.0.1:9/callback')).toBe('claudeCode')
    expect(clientKindFor('https://chatgpt.com/connector_platform_oauth_redirect')).toBe('chatgpt')
    expect(clientKindFor('https://chatgpt.com/connector/oauth/abc_DEF-123')).toBe('chatgpt')
  })

  it('refuses anything else, however close', () => {
    for (const uri of [
      'https://claude.ai/api/mcp/auth_callback/extra',
      'http://claude.ai/api/mcp/auth_callback',
      'https://claude.ai.evil.example/api/mcp/auth_callback',
      'https://chatgpt.com/connector/oauth/',
      'https://chatgpt.com/connector/oauth/x/../../evil',
      'https://chatgpt.com/connector/oauth/x@evil.example',
      'https://chatgpt.com/connector/oauth/x?next=https://evil.example',
      'https://claude.ai/api/mcp/auth_callback#frag',
      'http://localhost:1234/other',
      'http://localhost:1234/callback?x=1',
      'http://evil.example/callback',
      'https://localhost/callback',
      'not a url',
    ]) {
      expect(clientKindFor(uri), uri).toBeUndefined()
    }
  })

  it('ignores an app that is switched off', () => {
    expect(
      clientKindFor(
        'https://chatgpt.com/connector_platform_oauth_redirect',
        (k) => k !== 'chatgpt',
      ),
    ).toBeUndefined()
  })
})

describe('classifyRedirects', () => {
  it('accepts a set from one app', () => {
    expect(classifyRedirects(['http://localhost/callback', 'http://127.0.0.1/callback'])).toEqual({
      kind: 'claudeCode',
    })
  })

  it('refuses a set spanning two apps, which the consent screen could not name', () => {
    expect(
      classifyRedirects(['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback']),
    ).toHaveProperty('error')
  })

  it('says why when the app is switched off', () => {
    const result = classifyRedirects(
      ['https://chatgpt.com/connector_platform_oauth_redirect'],
      (k) => k !== 'chatgpt',
    )
    expect(result).toEqual({ error: expect.stringMatching(/ChatGPT connections are turned off/) })
  })

  it('refuses none, too many and non-strings', () => {
    expect(classifyRedirects([])).toHaveProperty('error')
    expect(classifyRedirects(Array(11).fill('http://localhost/callback'))).toHaveProperty('error')
    expect(classifyRedirects([42])).toHaveProperty('error')
  })
})

describe('redirectRegistered', () => {
  it('is exact for web callbacks', () => {
    expect(
      redirectRegistered('https://claude.ai/api/mcp/auth_callback', [
        'https://claude.ai/api/mcp/auth_callback',
      ]),
    ).toBe(true)
    expect(
      redirectRegistered('https://claude.ai/api/mcp/auth_callback?x', [
        'https://claude.ai/api/mcp/auth_callback',
      ]),
    ).toBe(false)
  })

  it('ignores the port on a loopback callback, and nothing else', () => {
    expect(
      redirectRegistered('http://localhost:61234/callback', ['http://localhost/callback']),
    ).toBe(true)
    expect(
      redirectRegistered('http://127.0.0.1:61234/callback', ['http://localhost/callback']),
    ).toBe(false)
    expect(redirectRegistered('http://localhost:61234/other', ['http://localhost/callback'])).toBe(
      false,
    )
  })

  it('recognises loopback addresses', () => {
    expect(isLoopback('http://[::1]:3000/callback')).toBe(true)
    expect(isLoopback('https://localhost/callback')).toBe(false)
  })
})
