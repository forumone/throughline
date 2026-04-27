---
'@forumone/throughline-integrations': minor
---

Initial release of the integrations server. Provides the `Integration` plugin contract every future integration (Salesforce, Mailchimp, etc.) follows, the registry, the admin-only Integrations collection, and five MCP tools (`list_integrations`, `get_integration_status`, `trigger_sync`, `test_integration`, `list_integration_types`). Includes a generic outbound webhook integration with HMAC-SHA256 signing (RFC 4231 known-answer tests pinned), configurable event filter / payload mode / timeout, healthcheck, and Inngest-driven retries. Configuration is admin-only by design — Claude can trigger and observe integrations but cannot retarget URLs or rotate secrets.
