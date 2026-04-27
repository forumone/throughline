import type { Logger, McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { loadManifest, type LoadedManifest } from '@forumone/throughline-design-contract'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import type { ManifestLoader } from '../manifest-source.js'

/** Loads the reference DS manifest once for all tool tests. */
export function loadFixture(): LoadedManifest {
  return loadManifest(referenceManifest)
}

/** Builds a manifest loader backed by an in-memory LoadedManifest. */
export function fixtureLoader(loaded: LoadedManifest = loadFixture()): ManifestLoader {
  return {
    async get() {
      return loaded
    },
    async refresh() {
      return loaded
    },
  }
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

export const fakeContext: McpToolContext = {
  user: {
    id: 'u1',
    email: 'tester@example.com',
    name: 'Tester',
    roles: ['admin'],
    groups: [],
  },
  apiKeyName: 'test-key',
  logger: noopLogger,
}

/** Helper that runs a tool's handler with the fake context. */
export async function callTool<I extends Record<string, unknown>>(
  tool: McpToolDefinition,
  args: I,
): Promise<unknown> {
  const parsed = tool.inputSchema.parse(args)
  return tool.handler(parsed, fakeContext)
}
