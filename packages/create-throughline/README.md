# @forumone/create-throughline

Scaffolder for new Throughline projects: Payload CMS, the Throughline suite registered by one `throughline()` call and served over MCP at `/api/mcp`, and an Inngest endpoint for its jobs.

## Usage

```bash
pnpm create @forumone/throughline my-client-site
```

Or with npm:

```bash
npm create @forumone/throughline@latest my-client-site
```

The scaffolder asks a small set of questions, then generates a pnpm monorepo
with Payload, `@forumone/throughline` and an Inngest endpoint already wired,
plus CI and an agent `CLAUDE.md`. After scaffolding you'll need to fill in
environment variables, create and apply the first migration, implement
client-specific resolvers (users, groups, approvers), and replace the example
content model with your own.

## What you get

```
my-client-site/
├── apps/
│   └── web/                 # Next.js + Payload, throughline() in payload.config.ts
├── design-system/           # the reference design system, or a placeholder for your own
├── scripts/                 # workspace gates: single instances, tested packages, audit
├── .claude/                 # agent settings and a Stop-hook gate
├── .github/                 # CI: fast and verify tiers
├── .env.example
├── CLAUDE.md
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

The full list is in the [reference](https://github.com/forumone/throughline/blob/main/docs/reference/create-throughline.md).

## After scaffolding

Read the generated `README.md` for full setup instructions. Expect 1–2 hours
from `pnpm create` to "Claude editing a real page" for the first project.
Subsequent projects should be much faster as you accumulate reusable patterns.
