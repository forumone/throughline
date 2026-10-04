/*
Which apps may connect, decided by where they send the person back to.

An OAuth client names itself — in a registration request, or in a metadata
document at its `client_id` URL — and anybody can claim to be "Claude". What a
client cannot fake is its redirect URI: the authorization code goes there, so a
client that registers somebody else's callback never sees a code. That makes
the redirect the one honest thing about a client, and this file is the whole
allowlist of them.

So a client is recognised by its redirect URIs, never by its name. Registration
is refused unless every redirect it asks for matches one rule here, the consent
screen names the client by the rule it matched rather than by what it calls
itself, and an administrator turns each rule on or off.

The callbacks are the clients' own documentation:

- **Claude** — claude.ai, Claude Desktop, mobile and Cowork share one hosted
  callback. https://claude.com/docs/connectors/building/authentication
- **Claude Code** — a native app, so an RFC 8252 loopback redirect on a port it
  picks per session. Matched with the port ignored, on `localhost` as well as
  the IP literals, because Claude Code declares `localhost`. Any other program
  on the person's computer can listen there too, which is why the consent
  screen warns when this is the rule that matched.
- **ChatGPT** — the stable callback when the authorization server returns `iss`
  (RFC 9207, which this one does), and the per-connector form otherwise.
  https://developers.openai.com/plugins/build/auth
*/

export const MCP_CLIENT_KINDS = ['claude', 'claudeCode', 'chatgpt'] as const
export type McpClientKind = (typeof MCP_CLIENT_KINDS)[number]

export interface McpClientRule {
  kind: McpClientKind
  /** What the consent screen and the Connect MCP page call it. */
  label: string
  /** Redirect URIs matched exactly. */
  redirectUris?: readonly string[]
  /** Redirect URI prefixes, for a callback that carries a per-connector id. */
  redirectPrefixes?: readonly string[]
  /** Loopback paths, matched on any port. */
  loopbackPaths?: readonly string[]
}

export const MCP_CLIENT_RULES: Readonly<Record<McpClientKind, McpClientRule>> = {
  claude: {
    kind: 'claude',
    label: 'Claude',
    redirectUris: [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
    ],
  },
  claudeCode: {
    kind: 'claudeCode',
    label: 'Claude Code',
    loopbackPaths: ['/callback'],
  },
  chatgpt: {
    kind: 'chatgpt',
    label: 'ChatGPT',
    redirectUris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
    redirectPrefixes: ['https://chatgpt.com/connector/oauth/'],
  },
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function parse(uri: string): URL | undefined {
  try {
    return new URL(uri)
  } catch {
    return undefined
  }
}

/** True for an `http://localhost`, `127.0.0.1` or `[::1]` redirect. */
export function isLoopback(uri: string): boolean {
  const url = parse(uri)
  return Boolean(url && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
}

/*
A URI with a fragment, credentials or an unparseable shape matches nothing:
RFC 6749 §3.1.2 forbids the first, and the second is how an open-looking URL
smuggles a different host past a prefix check (`https://chatgpt.com/connector/
oauth/x@evil.example` parses with `evil.example` as the host).
*/
function plain(url: URL): boolean {
  return url.hash === '' && url.username === '' && url.password === ''
}

function matchesRule(uri: string, rule: McpClientRule): boolean {
  const url = parse(uri)
  if (!url || !plain(url)) return false

  if (rule.loopbackPaths && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) {
    return rule.loopbackPaths.includes(url.pathname) && url.search === ''
  }
  if (url.protocol !== 'https:') return false
  if (rule.redirectUris?.includes(uri)) return true
  return Boolean(
    rule.redirectPrefixes?.some(
      (prefix) =>
        uri.startsWith(prefix) &&
        uri.length > prefix.length &&
        /^[A-Za-z0-9_-]+$/.test(uri.slice(prefix.length)),
    ),
  )
}

/**
 * The rule a redirect URI belongs to, among those switched on — or `undefined`
 * if it belongs to none.
 */
export function clientKindFor(
  uri: string,
  enabled: (kind: McpClientKind) => boolean = () => true,
): McpClientKind | undefined {
  return MCP_CLIENT_KINDS.find((kind) => enabled(kind) && matchesRule(uri, MCP_CLIENT_RULES[kind]))
}

/**
 * The one rule every one of a client's redirect URIs matches, or a reason.
 *
 * A client whose callbacks span two rules is refused rather than labelled by
 * either: the consent screen could only name one of them, and the code could go
 * to the other.
 */
export function classifyRedirects(
  uris: readonly unknown[],
  enabled: (kind: McpClientKind) => boolean = () => true,
): { kind: McpClientKind } | { error: string } {
  if (uris.length === 0) return { error: 'At least one redirect URI is required.' }
  if (uris.length > 10) return { error: 'At most ten redirect URIs may be registered.' }
  let kind: McpClientKind | undefined
  for (const uri of uris) {
    if (typeof uri !== 'string') return { error: 'Every redirect URI must be a string.' }
    const matched = clientKindFor(uri, () => true)
    if (!matched) return { error: `${uri} is not a redirect this site accepts.` }
    if (!enabled(matched)) {
      return {
        error: `${MCP_CLIENT_RULES[matched].label} connections are turned off on this site. An administrator can turn them on under MCP access.`,
      }
    }
    if (kind && kind !== matched) {
      return { error: 'Every redirect URI must belong to the same app.' }
    }
    kind = matched
  }
  return kind ? { kind } : { error: 'At least one redirect URI is required.' }
}

/**
 * Whether `requested` is one of a client's registered redirects.
 *
 * Exact, except that a loopback redirect is compared with its port ignored
 * (RFC 8252 §7.3): a native app registers once and listens on whatever port is
 * free each time.
 */
export function redirectRegistered(requested: string, registered: readonly string[]): boolean {
  if (registered.includes(requested)) return true
  if (!isLoopback(requested)) return false
  const want = parse(requested)
  if (!want || !plain(want)) return false
  return registered.some((each) => {
    const have = parse(each)
    return Boolean(
      have &&
      isLoopback(each) &&
      have.hostname === want.hostname &&
      have.pathname === want.pathname &&
      have.search === want.search,
    )
  })
}
