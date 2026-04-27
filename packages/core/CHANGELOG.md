# @forumone/throughline-core

## 0.2.1

### Patch Changes

- a4b5108: Initial release of the forms package. Wraps Payload's Form Builder plugin with the Throughline policy layer: mandatory privacy notice, consent enforcement (server-side), honeypot spam protection, Postgres-backed per-IP rate limiting, a destination allowlist (the security perimeter), and submitter confirmations. Six MCP tools (`list_allowed_destinations`, `validate_form`, `create_form`, `update_form_fields`, `update_form_destinations`, `get_form_submissions`) and four Inngest functions (`form-fan-out`, `form-email-destination`, `form-webhook-destination`, `form-submitter-confirmation`) drive the conversational flow and the async destination delivery. Includes `FormSubmissionEmail` and `SubmitterConfirmationEmail` React Email templates. Allowlist enforcement runs at three layers (MCP tool, collection beforeChange hook, fan-out worker) so prompt injection or admin direct-API writes can't bypass it. IPs are HMAC-hashed; raw IPs are never persisted. Adds `form.updated` to the core audit-action taxonomy used by the two update tools.

## 0.2.0

### Minor Changes

- [#14](https://github.com/forumone/throughline/pull/14) [`5329d97`](https://github.com/forumone/throughline/commit/5329d97363099a54bcae2516a8aa9eff8cd735fc) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. Provides the audit log (collection + fire-and-forget writer + plugin), MCP authentication (bearer-token authenticator + API-keys collection with SHA-256 hashed keys), event taxonomy and Inngest client factory, MCP handler infrastructure (JSON-RPC over HTTP) with the `_meta` helper for prompt/reasoning capture, standard env-var conventions, a default logger, and shared utilities. Every server package in the framework depends on this.
