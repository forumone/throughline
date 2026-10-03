# Reference

API reference for the three 1.0 packages. Pages are hand-written, and each covers what a part does, how to install and register it, its options, and what it exports.

The 0.x reference, a page per package, is on the [`v0` branch](https://github.com/forumone/throughline/tree/v0/docs/reference). [Upgrading from 0.x to 1.0](../guides/upgrading.md) maps a 0.x site onto these packages.

## [`@forumone/throughline`](throughline.md)

`throughline()` and its options, the subpaths, the optional peers, the audit log, MCP authentication, the environment check and the `throughline-payload` bin. Each plugin has its own page:

- **[Publishing](throughline/publishing.md)**: `/publishing`, the publish pipeline, its admin controls and the trust boundary
- **[Approvals](throughline/approvals.md)**: `/approvals`, approval requests, signed action links and their expiry
- **[Audit queries](throughline/audit.md)**: `auditQueryPlugin` in `/audit`, the audit log's MCP query tools
- **[Components](throughline/components.md)**: `/components`, the design-system manifest over MCP
- **[Integrations](throughline/integrations.md)**: `/integrations`, the `Integration` contract, the registry and the webhook integration
- **[Email](throughline/email.md)**: `/email`, Resend and the approval notifications
- **[Jobs](throughline/jobs.md)**: `/jobs`, `/jobs/inngest` and `/jobs/payload`, background work on either runner, and the cache-tag hooks

`/editorial`, `/media`, `/fields` and `/observability` are described in [the subpath table](throughline.md#subpaths) and their TSDoc.

## [`@forumone/throughline-design-system`](design-system.md)

The manifest a design system publishes, and what turns it into Payload blocks:

- **[The contract](design-system/contract.md)**: `/contract` and `/lint`
- **[Generating Payload blocks](design-system/generate.md)**: `/generate`, `/render`, `/client`, `/testing` and the `check-block-props` bin

## [`@forumone/create-throughline`](create-throughline.md)

The scaffolder, and the reference design system a new project starts from.
