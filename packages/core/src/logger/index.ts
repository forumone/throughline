/* eslint-disable no-console -- default logger intentionally delegates to console; consumers swap in their own. */
import type { Logger } from '@forumone/throughline-plugin-contract'

/** Default logger that delegates to `console`. Plugins fall back to this when no logger is supplied. */
export const defaultLogger: Logger = {
  debug: (message, context) => {
    if (context) console.debug(message, context)
    else console.debug(message)
  },
  info: (message, context) => {
    if (context) console.log(message, context)
    else console.log(message)
  },
  warn: (message, context) => {
    if (context) console.warn(message, context)
    else console.warn(message)
  },
  error: (message, context) => {
    if (context) console.error(message, context)
    else console.error(message)
  },
}

/**
 * Wraps a logger so every message is prefixed with a `[name]` tag. Useful
 * for request-scoped or plugin-scoped logging.
 */
export function createNamedLogger(name: string, base: Logger = defaultLogger): Logger {
  const tag = `[${name}]`
  return {
    debug: (message, context) => base.debug(`${tag} ${message}`, context),
    info: (message, context) => base.info(`${tag} ${message}`, context),
    warn: (message, context) => base.warn(`${tag} ${message}`, context),
    error: (message, context) => base.error(`${tag} ${message}`, context),
  }
}
