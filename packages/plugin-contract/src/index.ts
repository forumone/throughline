import type { Plugin } from 'payload'

/**
 * Options every Throughline core plugin accepts. Plugin-specific options
 * extend this interface.
 */
export interface BaseCorePluginOptions {
  /** Enable or disable the plugin without removing it from the config. Defaults to `true`. */
  enabled?: boolean
  /**
   * Route prefix the plugin mounts its MCP server and API endpoints under.
   * Defaults to a plugin-specific value (e.g. `/api/publishing`). Override
   * to avoid collisions or to expose under a different path.
   */
  routePrefix?: string
  /** Logger used for plugin diagnostics. Falls back to a console logger if omitted. */
  logger?: Logger
}

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
}

/**
 * The Throughline core plugin signature. A plugin takes its options and
 * returns a standard Payload {@link Plugin}.
 */
export type CorePlugin<Options extends BaseCorePluginOptions = BaseCorePluginOptions> = (
  options: Options,
) => Plugin

export * from './mcp.js'
export * from './auth.js'
export * from './registry.js'
