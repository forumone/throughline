import { afterEach, describe, expect, it } from 'vitest'
import { ENV_VARS, optionalEnv, requireEnv, validateBaseEnv } from './index.js'

describe('validateBaseEnv', () => {
  it('returns parsed env when all required vars are set', () => {
    const env = validateBaseEnv({
      PAYLOAD_SECRET: 'a'.repeat(32),
      DATABASE_URI: 'postgres://localhost:5432/foo',
      NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
    })
    expect(env.PAYLOAD_SECRET.length).toBe(32)
    expect(env.NEXT_PUBLIC_SERVER_URL).toBe('http://localhost:3000')
  })

  it('throws when PAYLOAD_SECRET is too short', () => {
    expect(() =>
      validateBaseEnv({
        PAYLOAD_SECRET: 'short',
        DATABASE_URI: 'postgres://localhost/foo',
        NEXT_PUBLIC_SERVER_URL: 'http://localhost',
      }),
    ).toThrow(/PAYLOAD_SECRET/)
  })

  it('throws when NEXT_PUBLIC_SERVER_URL is not a URL', () => {
    expect(() =>
      validateBaseEnv({
        PAYLOAD_SECRET: 'a'.repeat(32),
        DATABASE_URI: 'postgres://localhost/foo',
        NEXT_PUBLIC_SERVER_URL: 'not a url',
      }),
    ).toThrow(/NEXT_PUBLIC_SERVER_URL/)
  })

  it('throws when DATABASE_URI is missing', () => {
    expect(() =>
      validateBaseEnv({
        PAYLOAD_SECRET: 'a'.repeat(32),
        NEXT_PUBLIC_SERVER_URL: 'http://localhost',
      }),
    ).toThrow(/DATABASE_URI/)
  })
})

describe('requireEnv / optionalEnv', () => {
  const original = { ...process.env }
  afterEach(() => {
    process.env = { ...original }
  })

  it('requireEnv returns the value when set', () => {
    process.env.MY_VAR = 'hello'
    expect(requireEnv('MY_VAR')).toBe('hello')
  })

  it('requireEnv throws with a custom message when missing', () => {
    delete process.env.MY_VAR
    expect(() => requireEnv('MY_VAR', 'gimme')).toThrow('gimme')
  })

  it('optionalEnv returns the fallback when missing', () => {
    delete process.env.MY_VAR
    expect(optionalEnv('MY_VAR', 'default')).toBe('default')
  })

  it('optionalEnv returns the value when set', () => {
    process.env.MY_VAR = 'real'
    expect(optionalEnv('MY_VAR', 'default')).toBe('real')
  })
})

describe('ENV_VARS', () => {
  it('exposes the canonical names', () => {
    expect(ENV_VARS.PAYLOAD_SECRET).toBe('PAYLOAD_SECRET')
    expect(ENV_VARS.PUBLISHING_SERVER_API_KEY).toBe('PUBLISHING_SERVER_API_KEY')
  })
})
