# Throughline documentation

Throughline is a conversational content management framework. It exposes a Payload CMS application as a constellation of MCP servers so marketers can operate the site through Claude rather than a traditional admin UI.

If you want a one-page mental model: read [Architecture overview](concepts/architecture-overview.md). If you want to ship something: jump to [Scaffolding a project](getting-started/scaffolding-a-project.md).

## Sections

The docs follow the [Diátaxis framework](https://diataxis.fr/). Each section answers a different kind of question.

- **[Getting started](getting-started/)** — tutorials. Start here if you've never built a Throughline project. End-to-end, learn-by-doing, ~30 minutes from `pnpm create` to "Claude editing a page."
- **[Concepts](concepts/)** — explanations. Read these to understand *why* the system is shaped the way it is. The trust boundary, plugin composition, design system contracts, event-driven workflows.
- **[Guides](guides/)** — how-tos. Specific tasks with concrete steps. Add a collection, theme an email, write a custom accessibility check.
- **[Reference](reference/)** — API reference for every published package. Look up types, options, exported functions.
- **[Operations](operations/)** — deployment, environment variables, observability, security model, the Phase 2 roadmap.
- **[Spec](spec/)** — the original phased build plan (`C0` through `C14`). Useful if you're contributing to the framework itself.

## Audiences

- **Developers scaffolding a new project.** Start with [Scaffolding a project](getting-started/scaffolding-a-project.md) → [First Claude connection](getting-started/first-claude-connection.md) → [First publish](getting-started/first-publish.md).
- **Developers customizing a running project.** Read [Architecture overview](concepts/architecture-overview.md), then jump to the relevant [guide](guides/) or [package reference](reference/).
- **Design system authors.** Read [Design system contracts](concepts/design-system-contracts.md) → [Authoring component contracts](guides/authoring-component-contracts.md).
- **Engineering leads evaluating adoption.** Read [Architecture overview](concepts/architecture-overview.md), [The trust boundary](concepts/the-trust-boundary.md), [Security model](operations/security-model.md), [Deployment options](operations/deployment-options.md).

## What Throughline gives you

- **Edit pages through conversation.** "Update the homepage hero to focus on the new climate program." Claude calls Payload MCP under the hood.
- **Compose with a real design system.** The Components MCP server reasons about your DS — when to use Hero vs SectionIntro, what variants fit which intent, what compositions break editorial rules.
- **Publish with governance.** The Publishing MCP server enforces accessibility, approval workflows, scheduled publishing, and embargo policies automatically. Direct `_status` writes are blocked.
- **Approve from your inbox.** Approvers receive emails with inline action buttons. No CMS login required to sign off on a change.
- **Connect to anything.** The Integrations MCP server's plugin architecture makes CRM, marketing automation, and analytics connections straightforward.

## Status

Pre-1.0. APIs will change before 1.0. Track progress in [roadmap.md](roadmap.md).

## Naming note

The original specs (under `docs/spec/`) refer to packages as `@forumone/claude-cms-*`. The actual published packages use `throughline`. Mentally substitute when reading the specs.
