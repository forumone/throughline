import { UnauthorizedError, type PayloadRequest } from 'payload'
import { TOKEN_PREFIX } from './crypto.js'
import { protectedResourceMetadataUrl } from './metadata.js'
import {
  MCP_OAUTH_STRATEGY,
  readPolicy,
  toCamelCase,
  toolsFor,
  type McpOAuthRuntime,
} from './runtime.js'
import { authenticateAccessToken } from './store.js'

/*
`plugin-mcp`'s `overrideAuth`: who a request to `/api/mcp` is, and what they are
offered.

**An OAuth access token** resolves to its grant and the person behind it, read
fresh — their role is asked again on every request, so a person demoted or
removed is disconnected at their next call, and so is a whole app an
administrator has switched off. Their tools come from the policy for their
role, not from anything stored with the token, so changing the policy changes
every existing connection.

**Anything else is an API key**, handed to the plugin's own resolver unchanged,
then held to the same `eligible` rule (unless the host opts out) — the rule a
key was otherwise only checked against when it was made.

**A refusal is a 401 with a challenge.** That header is how an MCP client learns
where to sign in: `WWW-Authenticate: Bearer resource_metadata="…"`, pointing at
the protected-resource metadata. Claude starts sign-in on a 401 and nothing
else. `plugin-mcp` throws Payload's `UnauthorizedError`, which Payload turns into
a 401 carrying `req.responseHeaders` — so the header is set there and the error
thrown as usual.
*/

/** The shape `plugin-mcp` resolves a request to. Declared structurally: it is not a dependency here. */
export interface McpAccessSettings {
  user: Record<string, unknown>
  'payload-mcp-tool'?: Record<string, boolean>
  'payload-mcp-prompt'?: Record<string, boolean>
  [key: string]: unknown
}

export type OverrideAuth = (
  req: PayloadRequest,
  getDefaultMcpAccessSettings: (overrideApiKey?: null | string) => Promise<McpAccessSettings>,
) => Promise<McpAccessSettings>

function challenge(
  req: PayloadRequest,
  runtime: McpOAuthRuntime,
  error?: string,
  description?: string,
): never {
  const parts = [
    ...(error ? [`error="${error}"`] : []),
    // A header value is Latin-1; a site's refusal may be prose with curly quotes.
    ...(description
      ? [
          `error_description="${description.replace(/[’‘]/g, "'").replace(/[^\x20-\x7e]|["\\]/g, '')}"`,
        ]
      : []),
    `resource_metadata="${protectedResourceMetadataUrl(runtime)}"`,
    'scope="mcp"',
  ]
  const headers = req.responseHeaders ?? new Headers()
  headers.set('WWW-Authenticate', `Bearer ${parts.join(', ')}`)
  req.responseHeaders = headers
  throw new UnauthorizedError()
}

export function createOverrideAuth(runtime: McpOAuthRuntime): OverrideAuth {
  return async (req, getDefault) => {
    const header = req.headers.get('authorization') ?? ''
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
    if (!bearer) challenge(req, runtime)

    if (bearer.startsWith(TOKEN_PREFIX.access)) {
      const policy = await readPolicy(req.payload, runtime)
      const result = await authenticateAccessToken(req.payload, runtime, policy, bearer)
      if ('reason' in result) challenge(req, runtime, 'invalid_token', result.reason)

      const tools = toolsFor(result.user, policy, runtime)
      return {
        user: { ...result.user, collection: runtime.users, _strategy: MCP_OAUTH_STRATEGY },
        'payload-mcp-tool': Object.fromEntries(tools.map((name) => [toCamelCase(name), true])),
        'payload-mcp-prompt': Object.fromEntries(
          runtime.prompts.map((prompt) => [toCamelCase(prompt.name), true]),
        ),
      }
    }

    let settings: McpAccessSettings
    try {
      settings = await getDefault()
    } catch {
      challenge(req, runtime, 'invalid_token', 'The token is not valid.')
    }
    if (runtime.recheckApiKeyHolders) {
      const verdict = runtime.eligible(settings.user)
      if (verdict !== true) challenge(req, runtime, 'invalid_token', verdict)
    }
    return settings
  }
}
