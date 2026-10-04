# `@forumone/throughline/mcp-oauth`

People connect Claude, Claude Code or ChatGPT to the site's MCP server by signing in, with no API key to copy. They add one URL to the app, or click **Connect** on a connector their organization added. The app sends them to the site's own login, and they allow the connection. forumone-2026#838.

It is an OAuth 2.1 authorization server for `/api/mcp`, built on Payload endpoints, with three admin screens: **Connect MCP**, the consent screen, and the **MCP access** policy. API keys from `@payloadcms/plugin-mcp` keep working beside it.

## Wiring

```ts
// payload.config.ts
import { mcpOAuth } from '@forumone/throughline/mcp-oauth'

const oauth = mcpOAuth({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL, // the host people use, exactly
  serverName: 'Example',
  tools: suite.mcpTools, // the same arrays mcpPlugin serves
  prompts: suite.mcpPrompts,
  isAdmin: (user) => hasRole(user, 'admin'),
  eligible: (user) => hasRole(user, 'admin', 'editor') || 'Only an editor or an admin can connect.',
  claudeConnector: 'organization', // or 'personal' (the default)
  clients: { chatgpt: false }, // a default; an administrator changes it in MCP access
})

plugins: [
  suite.plugin, // declares the tools, so it comes first
  oauth.plugin,
  mcpPlugin({
    mcp: { tools: suite.mcpTools, prompts: suite.mcpPrompts },
    overrideAuth: oauth.overrideAuth,
  }),
]
```

```js
// next.config.mjs: discovery lives at /.well-known, and Payload routes only under /api
import { mcpOAuthRewrites } from '@forumone/throughline/mcp-oauth'
export default {
  async rewrites() {
    return mcpOAuthRewrites()
  },
}
```

It adds two collections and a global, so it needs a migration: `mcp-oauth-clients`, `mcp-oauth-grants` ("Connected apps") and `mcp-access`. The two new audit actions also change the audit collection's enum.

- **`serverURL` must be the host people actually use.** Clients compare the issuer and the resource byte for byte. An alias that redirects, such as the apex to `www`, breaks sign-in.
- **The two collections are filed in the admin group `Admin`** (`adminGroup`). The pages are at `/admin/connect-mcp` (`connectPath`), linked from an **MCP** group in the sidebar.

## What happens when someone connects

1. The app calls `/api/mcp` with no token. `overrideAuth` answers `401` with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`.
2. The app reads that document, then `/.well-known/oauth-authorization-server`.
3. It identifies itself. Claude and ChatGPT prefer a **client ID metadata document**, where the `client_id` is an HTTPS URL this server fetches. Otherwise they **register** (`POST /api/oauth/register`). Identical registrations share a row.
4. The browser goes to `GET /api/oauth/authorize`, which checks the client, the redirect, PKCE and `resource`. It then sends the person to `/admin/connect-mcp/authorize`, carrying the request signed and dated rather than stored.
5. Signed out? The page sends them to the admin login and back. Whatever the site signs in with, Okta included, applies.
6. The consent screen names the app by the callback it matched, says who it will act as and what it will be able to use, and warns when the callback is on the person's own computer. **Allow** creates a pending connection and a one-minute code.
7. The app exchanges the code at `POST /api/oauth/token`. It gets an access token (an hour) and a refresh token (thirty days since last use, rotated on every use).

## Which apps may connect

An app is recognised by its **redirect URIs**, never by its name. Anybody can claim to be "Claude", but only Claude receives codes at Claude's callback.

| App         | Callback                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude      | `https://claude.ai/api/mcp/auth_callback`, used by claude.ai, Desktop, mobile and Cowork                                                                 |
| Claude Code | `http://localhost/callback` or `http://127.0.0.1/callback`, on any port. Any app on the person's computer can listen there, so the consent screen warns. |
| ChatGPT     | `https://chatgpt.com/connector_platform_oauth_redirect`, or `https://chatgpt.com/connector/oauth/<id>`                                                   |

A registration, or a metadata document, whose redirects do not all match one enabled app is refused, with the reason. A metadata document is fetched only from a public HTTPS host on the default port, with no redirects followed, within five seconds and 64 KB, and is re-fetched daily.

## MCP access

The admin-only global `mcp-access`:

- **Apps that may connect.** One switch per app. Turning one off refuses new connections and disconnects existing ones at their next request.
- **Everyone who is not an administrator: tools.** Defaults to the eight authoring tools. A tool added to the site later is not offered until it is ticked here.
- **Administrators.** Every tool by default, including ones added later, or a chosen list.

Everyone who may connect is offered all the prompts.

## What is checked, and when

On **every MCP request**:

- the connection is active and its access token unexpired;
- its app is still switched on;
- the person still exists and `eligible` still says yes;
- their tools come from the policy as it is now.

If any of these fails, the request gets a `401` with the reason. Where the problem is the connection itself, the connection is revoked too. **Refreshing a token** asks the same questions.

**Security properties:**

- **A code used twice revokes its connection** (RFC 6749 §4.1.2).
- **A rotated refresh token presented again** within a minute is treated as a race between two refreshes and only refused. Later than that, it is treated as theft, and the connection is revoked (OAuth 2.1 §4.3.1).
- **Tokens are opaque and stored as an HMAC** keyed from the Payload secret. No API read returns a hash, an administrator's included. Rotating `PAYLOAD_SECRET` disconnects everyone.
- **A request through MCP may not read, make or revoke connections**, whether it came by key or by token.
- **The two endpoints a signed-in person calls** (`/api/oauth/consent` and `/api/oauth/grants/:id/revoke`) refuse a request whose `Origin` is not the site.

**API keys** are passed to the plugin's own lookup unchanged. With `recheckApiKeyHolders` (the default), the key's person is held to `eligible` on every request too. Before this, a key's holder was checked only when the key was made.

## Connect MCP

`/admin/connect-mcp` is for everyone who may connect:

- **The address**, with a Copy button.
- **Claude.** With `claudeConnector: 'organization'`, a button to Claude's connectors and the steps "find it, click Connect, Allow". With `'personal'`, a link to Claude's add-connector form with the name and address filled in.
- **Claude Code.** `claude mcp add --transport http <name> <address>` to copy, then `/mcp` to sign in.
- **ChatGPT**, when switched on. ChatGPT has no install link, so this is the Developer mode steps.
- **What a connected app can use**, from the policy, for the person's role.
- **Their connected apps**, with **Disconnect**. Administrators also get links to everyone's connections, to MCP access, and to API keys.

Each app's own setup is outside this package. On a Claude Team or Enterprise plan an Owner adds the URL once, under Organization settings → Connectors, and members then click Connect. Each Claude and ChatGPT client reaches the server from its vendor's cloud, so a firewall in front of the site must let that traffic through to `/api/mcp`, `/api/oauth/*` and `/.well-known/*`. Anthropic's addresses are `160.79.104.0/21`.

## Endpoints

| Method and path                     | For                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| `GET /api/oauth/metadata`           | RFC 8414 metadata (rewritten from `/.well-known/…`)   |
| `GET /api/oauth/protected-resource` | RFC 9728 metadata (rewritten from `/.well-known/…`)   |
| `POST /api/oauth/register`          | RFC 7591 registration                                 |
| `GET /api/oauth/authorize`          | The authorization request                             |
| `POST /api/oauth/consent`           | The consent screen's answer (signed in, same origin)  |
| `POST /api/oauth/token`             | `authorization_code` and `refresh_token`              |
| `POST /api/oauth/revoke`            | RFC 7009                                              |
| `POST /api/oauth/grants/:id/revoke` | Disconnect, from Connect MCP (signed in, same origin) |
