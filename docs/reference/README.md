# Reference

API reference for every published Throughline package. Each page covers:

- **Overview** — what the package does
- **Install / peers** — what to add and what it requires
- **Public API** — exported functions, classes, and types
- **Common usage** — a representative configuration
- **Related** — guides and concepts that cover this package

These pages are hand-authored. A future docs publishing flow will generate them from TypeScript types via typedoc; until then, treat this as the source-of-truth manual reference.

## Plugins

- **[@forumone/throughline-core](core.md)** — audit log, MCP auth + handler, Inngest client factory, env helpers, logger
- **[@forumone/throughline-components](components.md)** — Components MCP server (manifest-driven content drafting)
- **[@forumone/throughline-publishing](publishing.md)** — Publishing MCP server, the seven-stage publish pipeline
- **[@forumone/throughline-approvals](approvals.md)** — Approvals MCP server, approval resolver, action tokens
- **[@forumone/throughline-audit](audit.md)** — read-only MCP query tools over the audit log
- **[@forumone/throughline-integrations](integrations.md)** — Integrations MCP server, registry, Integration interface
- **[@forumone/throughline-email](email.md)** — Resend wrapper + React Email templates + Inngest workers
- **[@forumone/throughline-forms](forms.md)** — Form Builder wrapper with allowlisted destinations + spam/rate-limit hardening
- **[@forumone/throughline-workflows](workflows.md)** — Inngest function factories (revalidate, scheduled publish, expire approvals, healthcheck)

## Design system

- **[@forumone/throughline-design-contract](design-contract.md)** — manifest schema + lint rules
- **[@forumone/throughline-reference-ds](reference-ds.md)** — brand-neutral 12-component reference design system

## Tooling

- **[@forumone/throughline-plugin-contract](plugin-contract.md)** — shared types for building Throughline-compatible plugins
- **[@forumone/create-throughline](create-throughline.md)** — interactive scaffolder
