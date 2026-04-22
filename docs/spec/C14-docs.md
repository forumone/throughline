# Phase C14 — Documentation Site

## Goal

Build the documentation site that makes the framework usable by someone who didn't build it. Covers architecture concepts, getting started, per-package API reference, guides for common customizations, and the authoring guide for design system contracts. Lives at `docs.claude-cms.forumone.com` (or a similar URL) and deploys automatically as core evolves.

## Prerequisites

- C0 through C13 complete; the framework is functional and the CLI works
- At least one working end-to-end test of the system via the playground app

## Context

Good documentation is the difference between a framework that's used and a framework that sits on npm. Forum One will staff multiple client engagements on this architecture; each new engagement needs a place to send developers for "how does this work?". The docs site is that place.

The docs are not just API reference. API reference is generated from TypeScript types and is table stakes. The valuable part is the conceptual material: why the architecture is shaped this way, how the pieces fit, what the tradeoffs are, when to extend versus when to work within the framework. Developers reading the docs should come away understanding the *design intent*, not just the APIs.

Four audiences shape the structure:

**Developers scaffolding a new client project.** They need a 30-minute "getting started" path from `pnpm create` to a deployed site.

**Developers customizing a running project.** They need API reference for each package and guides for common customizations (adding a collection, adding an integration, theming emails).

**Design system authors.** They need the contract authoring guide — how to write good component contracts, what to put in anti-examples, how to test.

**Engineering leads evaluating adoption.** They need the architecture overview, the tradeoffs, the security model, and the operational story.

Structure follows the Diátaxis framework: tutorials, how-to guides, explanations, and reference are distinct sections, not mixed.

## Tasks

### C14.1 — Scaffold the docs app

Create `apps/docs/` in the core monorepo. Use Nextra (Next.js-based docs framework, good DX, deploys to Vercel cleanly):

```
apps/docs/
├── content/
│   ├── index.mdx                           # Landing
│   ├── getting-started/
│   │   ├── index.mdx                       # Tutorial entry
│   │   ├── scaffolding-a-project.mdx
│   │   ├── first-claude-connection.mdx
│   │   ├── first-publish.mdx
│   │   └── deploying-to-vercel.mdx
│   ├── concepts/
│   │   ├── index.mdx
│   │   ├── architecture-overview.mdx
│   │   ├── plugin-composition.mdx
│   │   ├── the-trust-boundary.mdx
│   │   ├── design-system-contracts.mdx
│   │   ├── event-driven-workflows.mdx
│   │   └── client-agnostic-core.mdx
│   ├── guides/
│   │   ├── index.mdx
│   │   ├── adding-a-collection.mdx
│   │   ├── authoring-component-contracts.mdx
│   │   ├── theming-emails.mdx
│   │   ├── adding-an-integration.mdx
│   │   ├── configuring-approvers.mdx
│   │   ├── customizing-accessibility-checks.mdx
│   │   ├── migrating-content.mdx
│   │   └── upgrading-core-packages.mdx
│   ├── reference/
│   │   ├── index.mdx
│   │   ├── core/
│   │   ├── design-contract/
│   │   ├── components/
│   │   ├── publishing/
│   │   ├── approvals/
│   │   ├── audit/
│   │   ├── integrations/
│   │   ├── workflows/
│   │   ├── email/
│   │   ├── forms/
│   │   └── cli/
│   ├── operations/
│   │   ├── index.mdx
│   │   ├── deployment-options.mdx
│   │   ├── environment-variables.mdx
│   │   ├── observability.mdx
│   │   ├── security-model.mdx
│   │   └── phase-2-expansions.mdx
│   └── meta.json                           # Nextra sidebar config
├── public/
│   └── architecture-diagram.svg
├── theme.config.tsx
├── next.config.mjs
├── package.json
└── tsconfig.json
```

### C14.2 — Write the landing page

`content/index.mdx`:

```mdx
---
title: Claude-First CMS
description: Conversational content management, built on Payload and Next.js.
---

# Claude-First CMS

A framework for building websites marketers operate through Claude rather than a traditional CMS admin.

Built on Payload CMS 3, Next.js, and a collection of MCP servers that expose content operations, design system intelligence, publishing workflows, approvals, forms, and integrations as conversational primitives.

## What you can do

- **Edit pages through conversation.** "Update the homepage hero to focus on the new climate program."
- **Compose with a real design system.** The Component Server reasons about your design system — when to use Hero vs SectionIntro, what variants fit which intent, what compositions break editorial rules.
- **Publish with governance.** The Publishing Server enforces accessibility, approval workflows, scheduled publishing, and embargo policies automatically.
- **Approve from your inbox.** Approvers receive emails with inline action buttons. No CMS login required to sign off on a change.
- **Connect to anything.** The Integrations Server's plugin architecture makes CRM, marketing automation, and analytics connections straightforward.

## Start here

- [Scaffold a new project in 15 minutes](/getting-started/scaffolding-a-project)
- [How the architecture is shaped](/concepts/architecture-overview)
- [Package reference](/reference)
```

### C14.3 — Write the getting-started tutorial

`content/getting-started/scaffolding-a-project.mdx` — a step-by-step walkthrough from `pnpm create` to a deployed admin. Include:

- Prerequisites (Node version, pnpm version, accounts needed)
- The `pnpm create @forumone/claude-cms` command and every prompt's answer
- Setting up Neon and pasting the connection string
- Generating secrets with openssl
- First `pnpm dev` run
- Creating the admin user
- Generating MCP keys
- Connecting Claude Desktop (or Claude Code) with the MCP configuration snippet
- The first round-trip: ask Claude to list pages, create a page, update a page
- "What you have now" summary and pointers to next tutorials

Aim for <30 minutes from command to first round-trip. Use screenshots for each major step.

`content/getting-started/first-claude-connection.mdx` — specifically about the Claude configuration side. How to add MCP servers to Claude Desktop's config, how to generate scoped API keys for different capabilities, how to test the connection with a specific prompt.

`content/getting-started/first-publish.mdx` — walks through making a change, asking Claude to publish, seeing it fail on policy (no SEO title, say), fixing it, publishing again, and seeing the public site update. This is the "aha moment" for most developers — they see the policy enforcement actually work.

`content/getting-started/deploying-to-vercel.mdx` — production deployment walkthrough. Vercel project setup, environment variables, database provisioning, Inngest integration, verifying MCP works against the production URL.

### C14.4 — Write the concepts docs

These are the explanatory pages. Each is shorter than the tutorials but denser. The goal is understanding, not action.

`content/concepts/architecture-overview.mdx` — the one-page mental model of the system. Must include:

- The stack (Next.js, Payload, Inngest, Resend, databases)
- The MCP server constellation with one-sentence descriptions
- The event flow: Claude → Payload MCP / Component Server → Publishing Server → Inngest → subscribers
- The trust boundary (Publishing Server as the only sanctioned path to published)
- Where client-specific code lives vs. where core lives

Include the SVG architecture diagram. Make it scannable.

`content/concepts/plugin-composition.mdx` — why every package is a Payload plugin, the ordering rules, the registry pattern, the symbol-based cross-plugin communication. This is the doc that makes the architecture's decoupling visible.

`content/concepts/the-trust-boundary.mdx` — the most important single concept. Why publishing goes through a gated pipeline. Why direct `_status` writes are blocked. Why composition validation, accessibility, approvals are all part of the same boundary. How custom accessibility checks fit in.

`content/concepts/design-system-contracts.mdx` — what a component contract is, why we need one, what makes a good contract, the role of anti-examples. This is the mental model that design system authors need.

`content/concepts/event-driven-workflows.mdx` — the Inngest side of the architecture. How events are the integration boundary, why side effects are async, how retries and observability work. Include the event taxonomy as a table.

`content/concepts/client-agnostic-core.mdx` — the two-track architecture. Why core doesn't know about Forum One or any specific client. How client projects extend via configuration. What belongs in core vs. in a client project.

### C14.5 — Write the how-to guides

Each guide is a specific task with a clear end state. Unlike tutorials (which teach concepts through doing), guides assume the reader knows the concepts and just wants the recipe.

`content/guides/adding-a-collection.mdx` — adding a new publishable collection (Programs, People, whatever). Covers: the Payload collection config, adding it to the Publishing plugin's collections list, registering blocks, writing the frontend rendering.

`content/guides/authoring-component-contracts.mdx` — how to write a good contract. What to put in intent, how to pick examples, how to write anti-examples that actually guide Claude, how to link to Storybook stories, how to test.

`content/guides/theming-emails.mdx` — passing brand tokens to the email plugin, customizing templates, testing in clients, setting up the sending domain.

`content/guides/adding-an-integration.mdx` — implementing the `Integration` interface, writing config fields, wiring Inngest functions, testing with the playground.

`content/guides/configuring-approvers.mdx` — defining groups, implementing the groupResolver, mapping group membership to SSO roles (Phase 2 hint).

`content/guides/customizing-accessibility-checks.mdx` — writing a custom AccessibilityCheck, registering it with the Publishing plugin, understanding the check/warning distinction.

`content/guides/migrating-content.mdx` — patterns for importing content from an existing CMS into a Claude-First CMS. Approaches: API-to-API, export-import through CSV, writing a one-time migration script using Payload's local API. Cautions about preserving URLs and SEO.

`content/guides/upgrading-core-packages.mdx` — how Changesets versioning works, how to read breaking change notes, how to upgrade a client project package-by-package, how to pin versions if an upgrade is problematic.

### C14.6 — Build the API reference pages

Reference pages are 80% generated from TypeScript types plus JSDoc. Use a generation approach:

1. For each core package, run `typedoc` (or a similar tool) against the published `.d.ts` files to produce API documentation
2. Write thin MDX wrappers that import the generated content and add contextual prose
3. Run generation as part of the docs build

Each package's reference page includes:

- **Overview** — one paragraph explaining what this package does
- **Installation and peer dependencies**
- **Options** — full type reference for the plugin options object, with example configurations
- **Exported functions and types** — API reference
- **Events fired** — the event taxonomy entries this package contributes (for workflows/integrations that subscribe to them)
- **Capabilities registered** — what other plugins can depend on from this one

Example: `content/reference/publishing/index.mdx`

```mdx
---
title: "@forumone/claude-cms-publishing"
description: Policy-gated publishing server for the Claude-First CMS.
---

import { OptionsTable } from '@/components/OptionsTable'
import options from '@/generated/publishing-options.json'

# @forumone/claude-cms-publishing

The trust boundary of the framework. Wraps Payload's update operation with a seven-step policy-gated pipeline: exist, composition, accessibility, required fields, embargo, approval, execute. Only this plugin can transition a document to published state; direct `_status` writes through Payload MCP are blocked.

## Installation

```bash
pnpm add @forumone/claude-cms-publishing
```

Peer dependencies: `payload@^3.0.0`, `inngest@^3.0.0`.

## Usage

```typescript
import { publishingPlugin } from '@forumone/claude-cms-publishing'

publishingPlugin({
  inngest,
  collections: [
    { slug: 'pages' },
    { slug: 'posts', layoutField: 'layout' },
  ],
  accessibilityChecks: [myCustomCheck],
  approvalResolver: { /* ... */ },
})
```

## Options

<OptionsTable options={options} />

## Pipeline stages

[Table of the seven pipeline steps, each with what it checks, what error codes it can produce, and how Claude surfaces the error to the user.]

## MCP tools

[Table of the five MCP tools exposed: publish, unpublish, schedule_publish, get_publish_status, rollback.]

## Events fired

- `content/page.published` on successful publish
- `content/page.unpublished` on unpublish
- `content/page.rolled_back` on rollback
- `content/page.scheduled` when a future publish is scheduled

## Capabilities registered

- `publishing`
- `publish-pipeline`
```

### C14.7 — Write the operations docs

`content/operations/deployment-options.mdx` — Vercel vs. long-running container (Railway, Fly). When cold starts matter, when they don't, what to measure before switching.

`content/operations/environment-variables.mdx` — the canonical list of env vars, grouped by feature. Descriptions, how to generate each, what happens if missing.

`content/operations/observability.mdx` — what the audit log captures, how to read it, the Inngest dashboard, Resend's delivery logs, recommended Phase 2 additions (Sentry, Axiom).

`content/operations/security-model.mdx` — threat model. The trust boundary. The allowlist for form destinations. API key scoping. Approval action token HMAC design. What's in scope and what requires Phase 2 additions (SSO, secrets management).

`content/operations/phase-2-expansions.mdx` — the "what's next" document pulled forward from the original spec's Phase 13. Each expansion (SSO, search, cache, observability, etc.) with when to add it and how it fits.

### C14.8 — Build reusable documentation components

Create a small component library for the docs:

```
apps/docs/components/
├── OptionsTable.tsx         # Renders a table from TypeScript option types
├── ToolsTable.tsx           # Renders MCP tool reference
├── EventFlow.tsx            # Animated/interactive event flow diagram
├── Callout.tsx              # Info/warning/tip boxes
├── CodeTabs.tsx             # Multi-language code examples
└── ArchitectureDiagram.tsx  # The one-page architecture visual
```

Use these consistently. Consistency is a documentation feature.

### C14.9 — Set up deployment

Create a separate Vercel project for the docs. Connect to the core monorepo; Vercel automatically builds the docs on every main merge.

URL: `docs.claude-cms.forumone.com` (or similar — whatever subdomain Forum One wants).

Set up search via Nextra's built-in Flexsearch, or upgrade to Algolia DocSearch if engagement warrants it.

### C14.10 — Set up changelog automation

Configure the docs site to read `CHANGELOG.md` from each published package and render them at `/changelog/<package>`. This is free from Changesets — every published release produces a changelog entry that becomes a documentation page.

Optionally, aggregate all package changelogs into a unified timeline at `/changelog` for quick scanning across the framework.

### C14.11 — Write the README for the docs app

`apps/docs/README.md`:

```markdown
# Claude-First CMS Documentation

Documentation site for the framework. Built with Nextra (Next.js-based), deployed to Vercel.

## Running locally

```bash
cd apps/docs
pnpm dev
```

Open http://localhost:3000.

## Adding content

MDX files in `content/`. Sidebar order is controlled by `meta.json` files.

Reference pages import generated API docs from `generated/`. These regenerate on `pnpm generate-api-docs` or as part of `pnpm build`.

## Deployment

Auto-deploys on every push to main via Vercel.
```

### C14.12 — Acceptance walk-through

Before declaring C14 done, walk through the following paths as if you had never seen the framework:

- Landing page → "What can I do?" — clear in under 60 seconds
- Getting started → first prompt to Claude — under 30 minutes
- Concepts → understand why the publish pipeline has seven stages — under 10 minutes
- Reference → find the type of the publishingPlugin's `collections` option — under 30 seconds
- Guides → figure out how to add a new collection — under 15 minutes with the guide

If any of these paths is slow or unclear, revise. The docs are a product, not an obligation.

## Acceptance criteria

- [ ] Docs site lives at a public URL, auto-deploys from main
- [ ] Landing page clearly communicates what the framework is and who it's for
- [ ] Getting-started tutorial gets a new developer to a running system in <30 min
- [ ] Concepts section covers architecture, trust boundary, contracts, events, client-agnostic core
- [ ] How-to guides cover the common customization needs
- [ ] Reference pages exist for every published package
- [ ] API reference is generated from TypeScript types (not hand-maintained)
- [ ] Operations section covers deployment, env vars, security, Phase 2 roadmap
- [ ] Changelog pages auto-update from Changesets
- [ ] Search works
- [ ] All the acceptance walk-through paths succeed

## Notes for Claude Code

- Write the concepts section first, then tutorials, then guides, then reference. Writing in this order surfaces gaps in mental model early — if you can't explain a concept clearly, the code behind it might be confused too. Reference last because it's the most mechanical.
- The Diátaxis framework (tutorial / how-to / explanation / reference) really does help. Keep the four modes distinct. A guide that gets into "why" is an explanation; an explanation with step-by-step instructions is a guide; mixing them confuses readers.
- Generate API reference from types. Hand-maintained reference rots. Use typedoc or similar; a small investment in the generation pipeline pays back immediately and compounds.
- The landing page is the single most-read document. Obsess over it. Test it on someone who hasn't seen the framework; watch where their eyes go; iterate.
- Screenshots age poorly. Use them in tutorials (where they help) but not in concepts or reference (where prose is more maintainable). When using screenshots, use real ones captured in the actual UI — mocked-up screenshots look worse than no screenshots.
- The acceptance walk-through (C14.12) is the real completion test. If the docs don't pass it, the docs aren't done, regardless of page count.
- Commit after each section (C14.2 landing, C14.3 getting started, C14.4 concepts, etc.). The commits trace the writing process and make review easier.

## What's next

Core is complete. Phase F1 kicks off the forumone.com track — scaffolding the first real client project using the CLI. After F1, the forumone.com repo exists and points at core. The framework is no longer theoretical; it has its first production user.
