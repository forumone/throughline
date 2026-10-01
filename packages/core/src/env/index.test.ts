import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnvRequirement } from '@forumone/throughline-plugin-contract'
import { EnvironmentError, assertEnvironment, checkEnvValue } from './index.js'

const SECRET: EnvRequirement = {
  name: 'TEST_SIGNING_SECRET',
  minLength: 32,
  why: 'Signs test links.',
}
const KEY: EnvRequirement = { name: 'TEST_API_KEY', why: 'Talks to the test API.' }
const URL_: EnvRequirement = { name: 'TEST_PUBLIC_URL', why: 'Where links point.' }

function thrown(run: () => void): EnvironmentError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentError)
    return error as EnvironmentError
  }
  throw new Error('expected assertEnvironment to throw')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkEnvValue', () => {
  it('treats undefined, empty and whitespace as missing', () => {
    expect(checkEnvValue(KEY, undefined)).toEqual({ kind: 'missing' })
    expect(checkEnvValue(KEY, '')).toEqual({ kind: 'missing' })
    expect(checkEnvValue(KEY, '   ')).toEqual({ kind: 'missing' })
  })

  it('enforces minLength at the boundary', () => {
    expect(checkEnvValue(SECRET, 'x'.repeat(31))).toEqual({
      kind: 'too-short',
      length: 31,
      minLength: 32,
    })
    expect(checkEnvValue(SECRET, 'x'.repeat(32))).toBeUndefined()
  })

  it('accepts any non-empty value when there is no minLength', () => {
    expect(checkEnvValue(KEY, 'k')).toBeUndefined()
  })
})

describe('assertEnvironment', () => {
  it('passes when every requirement is met', () => {
    vi.stubEnv(SECRET.name, 's'.repeat(40))
    vi.stubEnv(KEY.name, 'key')
    expect(() => assertEnvironment([SECRET, KEY])).not.toThrow()
  })

  it('reports every problem in one error, each with its why', () => {
    vi.stubEnv(SECRET.name, 'short')
    vi.stubEnv(KEY.name, '')
    vi.stubEnv(URL_.name, '')
    const error = thrown(() => assertEnvironment([SECRET, KEY], URL_))

    expect(error.problems).toEqual([
      'TEST_SIGNING_SECRET is 5 characters; the minimum is 32. Signs test links.',
      'TEST_API_KEY is not set. Talks to the test API.',
      'TEST_PUBLIC_URL is not set. Where links point.',
    ])
    for (const line of error.problems) expect(error.message).toContain(line)
  })

  it('opens with a line that names it a configuration problem', () => {
    vi.stubEnv(KEY.name, '')
    vi.stubEnv(URL_.name, '')
    const error = thrown(() => assertEnvironment(KEY, URL_))
    expect(error.name).toBe('EnvironmentError')
    expect(error.message.split('\n')[0]).toMatch(
      /^Configuration problem: 2 environment variables are missing or invalid\./,
    )

    vi.stubEnv(URL_.name, 'https://example.com')
    expect(thrown(() => assertEnvironment(KEY, URL_)).message.split('\n')[0]).toMatch(
      /^Configuration problem: 1 environment variable is missing or invalid\./,
    )
  })

  it('never prints a value, even one that fails', () => {
    const tooShort = 'hunter2-not-long-enough'
    vi.stubEnv(SECRET.name, tooShort)
    vi.stubEnv(KEY.name, 'sk_live_this_one_is_fine')
    vi.stubEnv(URL_.name, '')
    const error = thrown(() => assertEnvironment(SECRET, KEY, URL_))
    expect(error.message).not.toContain(tooShort)
    expect(error.message).not.toContain('sk_live_this_one_is_fine')
    expect(error.message).toContain(`is ${tooShort.length} characters`)
  })

  it('reports a name listed twice once, against the strictest minLength', () => {
    vi.stubEnv(SECRET.name, 'x'.repeat(40))
    const stricter: EnvRequirement = { name: SECRET.name, minLength: 48, why: 'Site wants more.' }
    const error = thrown(() => assertEnvironment([SECRET], stricter, SECRET))
    expect(error.problems).toEqual([
      'TEST_SIGNING_SECRET is 40 characters; the minimum is 48. Signs test links. Site wants more.',
    ])
  })

  it('adds the message of a check function that throws, after the named requirements', () => {
    vi.stubEnv(KEY.name, '')
    const error = thrown(() =>
      assertEnvironment(
        () => {
          throw new Error('No database connection string. Set DATABASE_URI.')
        },
        KEY,
        () => 'fine',
      ),
    )
    expect(error.problems).toEqual([
      'TEST_API_KEY is not set. Talks to the test API.',
      'No database connection string. Set DATABASE_URI.',
    ])
  })

  it('accepts no arguments', () => {
    expect(() => assertEnvironment()).not.toThrow()
  })
})
