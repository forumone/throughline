---
'@forumone/throughline': minor
---

`@forumone/throughline/mcp-oauth`: people connect Claude, Claude Code or ChatGPT to `/api/mcp` by signing in, not by being handed an API key (forumone-2026#838).

- `mcpOAuth()` adds an OAuth 2.1 authorization server for `/api/mcp`, with discovery, client ID metadata documents and dynamic registration, PKCE S256, `iss` in the response, rotating refresh tokens and reuse detection, plus revocation. Apps are recognised by an allowlist of their redirect URIs. Its `overrideAuth` goes to `mcpPlugin`.
- An admin-only **MCP access** global decides which apps may connect and which tools administrators and everyone else are offered. Connections and their tools are re-read on every request, so a policy change, a revoked connection or a lost role takes effect at the next call.
- **Connect MCP** (`/admin/connect-mcp`) shows the address, a button for Claude, the Claude Code command and the ChatGPT steps, and lists the person's connected apps with Disconnect. The consent screen names the app by the callback it matched, not by what it calls itself.
- API keys keep working beside it. By default the person behind a key is now held to the same `eligible` rule on every request.
- `AUDIT_ACTIONS` gains `mcp.connected` and `mcp.disconnected`. **This is an enum migration in the host.** `ReportsNav` takes an optional `label`.
