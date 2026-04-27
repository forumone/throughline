import { describe, expect, it, vi } from 'vitest'
import { createNamedLogger, defaultLogger } from './index.js'

describe('defaultLogger', () => {
  it('passes message and context to console for each level', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    defaultLogger.debug('d', { a: 1 })
    defaultLogger.info('i')
    defaultLogger.warn('w', { b: 2 })
    defaultLogger.error('e')

    expect(debug).toHaveBeenCalledWith('d', { a: 1 })
    expect(log).toHaveBeenCalledWith('i')
    expect(warn).toHaveBeenCalledWith('w', { b: 2 })
    expect(error).toHaveBeenCalledWith('e')

    debug.mockRestore()
    log.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })
})

describe('createNamedLogger', () => {
  it('prefixes every level with the name', () => {
    const calls: Array<[string, string, unknown?]> = []
    const base = {
      debug: (m: string, c?: unknown) => calls.push(['debug', m, c]),
      info: (m: string, c?: unknown) => calls.push(['info', m, c]),
      warn: (m: string, c?: unknown) => calls.push(['warn', m, c]),
      error: (m: string, c?: unknown) => calls.push(['error', m, c]),
    }
    const logger = createNamedLogger('audit', base)
    logger.info('hello')
    logger.error('boom', { code: 500 })
    expect(calls).toEqual([
      ['info', '[audit] hello', undefined],
      ['error', '[audit] boom', { code: 500 }],
    ])
  })
})
