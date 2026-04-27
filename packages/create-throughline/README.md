# @forumone/create-throughline

Scaffolder for new Throughline projects (Payload CMS + MCP servers + Inngest workflows).

## Usage

```bash
pnpm create @forumone/throughline my-client-site
```

Or with npm:

```bash
npm create @forumone/throughline@latest my-client-site
```

The scaffolder asks a small set of questions, then generates a ready-to-run
pnpm monorepo with Payload, all Throughline plugins, and an Inngest endpoint
already wired. After scaffolding you'll need to fill in environment variables,
implement client-specific resolvers (users, groups, approvers), and replace
the example content model with your own.

## What you get

```
my-client-site/
├── apps/
│   └── web/                 # Next.js + Payload with all plugins wired
├── packages/
│   ├── design-system/       # Reference DS (or placeholder for your own)
│   ├── content/             # Client-specific collections & blocks
│   └── brand/               # Brand tokens + email theme
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## After scaffolding

Read the generated `README.md` for full setup instructions. Expect 1–2 hours
from `pnpm create` to "Claude editing a real page" for the first project.
Subsequent projects should be much faster as you accumulate reusable patterns.
