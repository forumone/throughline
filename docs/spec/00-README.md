# Claude-First CMS — Build Plan

A conversational content management system where marketers operate the website through Claude rather than a traditional CMS UI. This plan builds it as a reusable framework that Forum One can use as the starting point for every future client engagement, with forumone.com as the first real consumer.

## The two-track structure

**Core framework** (`@forumone/claude-cms`) — a monorepo of versioned npm packages: MCP servers, Payload plugins, Inngest workflows, email system, design contract, reference design system, CLI. Published to npm. Client-agnostic by construction.

**Client projects** — independent repos, each structured as a small pnpm monorepo that consumes the core packages. Forumone.com is the first. Each has its own design system, content model, brand, and integrations. Clients opt into core upgrades at their own pace.

Because core is independently versioned and published, client projects never need to live in the core monorepo. Each client project is its own git repo, its own deployment, its own ops surface. The only connection back to core is package dependencies.

## The three tracks and their phases

**Track C — Core framework** (15 phases, C0 through C14)
Builds the reusable infrastructure. Ships as npm packages. This is the product.

**Track F — Forumone.com** (7 phases, F1 through F7)
First real client project. Consumes core. Validates the architecture by shipping a real production site. Templates everything for client #2.

**Track N — Next client / getting started** (3 phases, N1 through N3)
The consolidation pass after forumone.com launches. Extracts the "how to start a client project" guide from lived experience. Releases core 1.0.

## Phase overview

### Track C — Core

| # | Phase | Delivers |
|---|---|---|
| C0 | Monorepo scaffold | Turborepo + changesets, CI, npm publishing pipeline |
| C1 | Plugin architecture | Payload plugin pattern, composition model, shared options contract |
| C2 | Design contract package | `@forumone/claude-cms-design-contract` — schema, validator, manifest loader |
| C3 | Reference design system | `@forumone/claude-cms-reference-ds` — 10-12 components with contracts |
| C4 | Core plumbing | `@forumone/claude-cms-core` — audit log, Inngest client, shared utilities |
| C5 | Component Server | `@forumone/claude-cms-components` — MCP server exposing manifest |
| C6 | Publishing Server | `@forumone/claude-cms-publishing` — policy-gated publishing pipeline |
| C7 | Approvals Server | `@forumone/claude-cms-approvals` — workflow and conversational approvals |
| C8 | Audit query server | `@forumone/claude-cms-audit` — audit log + query MCP |
| C9 | Integrations Server | `@forumone/claude-cms-integrations` — plugin registry + generic webhook |
| C10 | Workflows package | `@forumone/claude-cms-workflows` — composable Inngest functions |
| C11 | Email package | `@forumone/claude-cms-email` — Resend wrapper + themeable templates |
| C12 | Forms package | `@forumone/claude-cms-forms` — policy-aware Form Builder wrapper |
| C13 | CLI | `create-claude-cms` — scaffolds new client projects |
| C14 | Documentation site | Architecture docs, guides, API reference |

### Track F — Forumone.com

| # | Phase | Delivers |
|---|---|---|
| F1 | Project scaffold | forumone.com repo created via CLI, core wired, deployed |
| F2 | Design system integration | Forum One Agentic Design System as workspace package with authored contracts |
| F3 | Content model | Forum One's collections (Pages, Posts, Programs, People, Insights, Case Studies) |
| F4 | Brand integration | Tokens, email templates, voice config, approver groups, destination allowlist |
| F5 | Site architecture | Information architecture and content composition designed with Claude |
| F6 | Content migration | Existing forumone.com content imported |
| F7 | Launch | QA, a11y audit, redirects, SEO preservation, DNS cutover |

### Track N — Next client + consolidation

| # | Phase | Delivers |
|---|---|---|
| N1 | Getting started guide | The onboarding doc for client project #2, drawn from forumone.com lessons |
| N2 | Core 1.0 release | API surface stabilized based on real usage; breaking changes landed |
| N3 | Phase 2 readiness | Runbooks for SSO, search, observability, etc. — the expansions deferred from Phase 1 |

## Dependency map

Core phases must complete in roughly the order listed because later phases build on earlier ones:

- C0 → everything
- C1 → C4 through C12
- C2 → C3, C5
- C3 → C5 (for testing)
- C4 → C5 through C12 (all server packages need core plumbing)
- C5, C6, C7, C8, C9 can be developed in parallel by different contributors after C4 ships
- C10, C11 → C12
- C12 → C13 (CLI needs to know what packages to offer)

Forumone.com track can start once **C12 ships** (all core packages published as beta versions). It does not require C13 (CLI) or C14 (docs) — F1 can scaffold manually. But having C13 makes F1 dramatically faster, so the preference is to finish C13 before starting F1.

Consolidation track (N) starts after F7. N is short and sharp; a week or two of focused work.

## What this plan is not

This is a build plan, not a project management plan. It does not estimate durations, assign owners, or sequence sprints. The phases are dependency-ordered; how you group them into sprints, staff them, or pace them is a separate decision.

It also does not prescribe that every phase must be done in a single session, or that you must finish C14 before starting F1. The sequence is about dependencies; practice can run phases in parallel where dependencies allow.

## How to use this spec with Claude Code

Each phase file is a self-contained prompt for Claude Code. They are labeled by track and number (C0.md, C1.md, F1.md, etc.). Feed one to Claude Code, verify acceptance criteria, commit, move on.

The phases assume Claude Code is running in the relevant repo — core phases run in the `@forumone/claude-cms` monorepo, forumone.com phases run in the `forumone-website` repo, consolidation phases cross-cut.

Each phase file follows the same structure:

- **Goal** — what this phase produces
- **Prerequisites** — other phases that must be complete first
- **Context** — design intent and why this phase is shaped this way
- **Tasks** — ordered, specific work items (numbered like C5.1, C5.2)
- **Acceptance criteria** — checkboxes for verifying completeness
- **Notes for Claude Code** — instructions specific to the agentic build
- **What's next** — which phase follows

## Technology stack (Phase 1)

Same stack as the original plan. Documented here for reference; each phase documents its own specifics.

**Infrastructure:** Vercel, Neon Postgres, Vercel Blob, Inngest, Resend

**Frameworks:** Next.js 15, Payload CMS 3, React 19, TypeScript 5, Tailwind 4 (reference DS only; clients choose their own)

**Tooling:** pnpm 9+, Turborepo, Changesets, Zod, Vitest, Playwright (for reference DS and CLI testing)

**MCP:** `@modelcontextprotocol/sdk` with bearer-token auth over HTTP

## Repository structure

**Core monorepo** (`@forumone/claude-cms`):

```
claude-cms/
├── packages/
│   ├── design-contract/           # C2 — Zod schema, manifest loader
│   ├── reference-ds/              # C3 — minimal design system
│   ├── core/                      # C4 — shared plumbing
│   ├── components/                # C5 — Component Server
│   ├── publishing/                # C6 — Publishing Server
│   ├── approvals/                 # C7 — Approvals Server
│   ├── audit/                     # C8 — Audit query server
│   ├── integrations/              # C9 — Integrations Server + registry
│   ├── workflows/                 # C10 — Inngest functions
│   ├── email/                     # C11 — Email system
│   ├── forms/                     # C12 — Forms layer
│   └── create-claude-cms/         # C13 — CLI scaffolder
├── apps/
│   ├── docs/                      # C14 — documentation site
│   └── playground/                # internal dev app consuming all packages
├── .changeset/
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

**Client project** (`forumone-website`, and every future client):

```
client-site/
├── apps/
│   ├── web/                       # Next.js + Payload, consumes core packages
│   └── design-system/             # optional: Storybook deploy for the client DS
├── packages/
│   ├── design-system/             # Client's DS (satisfies the contract)
│   ├── content/                   # Client-specific collections and blocks
│   ├── brand/                     # Tokens, email templates, voice
│   ├── integrations/              # Client-specific integration modules
│   └── types/                     # Generated Payload types + shared types
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

## A note on voice

Where phases produce user-facing strings (error messages, admin UI copy, email templates), core uses neutral, clear prose that client apps can override. Forum One's voice (no em dashes, no hedging, affirmative, mission-driven) is applied in the forumone.com track via the brand package, not in core.

Core email templates accept a token object for colors and typography. Clients provide their own palette; core never hardcodes Forum One colors or fonts.
