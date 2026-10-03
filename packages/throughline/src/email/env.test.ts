import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import { assertEnvironment, EnvironmentError } from '../env/index.js'
import { emailEnv } from './options.js'
import { validateOptions } from './options.js'

/*
The declaration a site hands to assertEnvironment, and the check this plugin
runs at init, must say the same thing: every declared variable is refused when
missing or short, and with only the declared ones set the plugin starts — so it
reads nothing from the environment that the declaration leaves out.
*/

const options = {
  inngest: {} as Inngest,
  resolveApprover: async () => null,
  resolveRequester: async () => null,
  buildActionUrl: async () => 'https://example.com/action',
}

const longEnough = (minLength = 1) => 'x'.repeat(minLength)

describe('emailEnv', () => {
  beforeEach(() => {
    for (const { name, minLength } of emailEnv) vi.stubEnv(name, longEnough(minLength))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('declares at least one variable, each with a reason', () => {
    expect(emailEnv.length).toBeGreaterThan(0)
    for (const { why } of emailEnv) expect(why.length).toBeGreaterThan(20)
  })

  it('starts with only the declared variables set', () => {
    expect(() => validateOptions(options)).not.toThrow()
    expect(() => assertEnvironment(emailEnv)).not.toThrow()
  })

  for (const { name, minLength } of emailEnv) {
    it(`refuses to start without ${name}, and assertEnvironment reports it`, () => {
      vi.stubEnv(name, '')
      expect(() => validateOptions(options)).toThrow(name)
      expect(() => assertEnvironment(emailEnv)).toThrow(EnvironmentError)
      expect(() => assertEnvironment(emailEnv)).toThrow(`${name} is not set.`)
    })

    if (minLength !== undefined) {
      it(`refuses ${name} one character short of ${minLength}, as assertEnvironment does`, () => {
        vi.stubEnv(name, longEnough(minLength - 1))
        expect(() => validateOptions(options)).toThrow()
        expect(() => assertEnvironment(emailEnv)).toThrow(`${name} is ${minLength - 1} characters`)
      })
    }
  }
})
