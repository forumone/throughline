---
'@forumone/throughline-core': minor
---

Initial release. Provides the audit log (collection + fire-and-forget writer + plugin), MCP authentication (bearer-token authenticator + API-keys collection with SHA-256 hashed keys), event taxonomy and Inngest client factory, MCP handler infrastructure (JSON-RPC over HTTP) with the `_meta` helper for prompt/reasoning capture, standard env-var conventions, a default logger, and shared utilities. Every server package in the framework depends on this.
