# Getting started

A learn-by-doing path from zero to "Claude editing a page" in about 30 minutes.

Read in order:

1. **[Scaffolding a project](scaffolding-a-project.md)** — `pnpm create @forumone/throughline`, fill in env vars, run the first migration, get the dev server running.
2. **[First Claude connection](first-claude-connection.md)** — make an MCP key in the admin and point your MCP client (Claude Desktop, Claude Code, or any MCP-aware client) at `/api/mcp`.
3. **[First publish](first-publish.md)** — make a content change, watch the publish pipeline reject it on a policy gate, fix it, see it land. This is the moment the framework clicks.
4. **[Deploying to Vercel](deploying-to-vercel.md)** — production deployment walkthrough.

## What you'll need

- Node.js 20.9+ and pnpm 10+
- A Postgres database — [Neon](https://neon.tech) free tier is fine for development
- An [Inngest](https://inngest.com) account for production — local dev works without one (use `npx inngest-cli dev`)
- A [Resend](https://resend.com) API key for transactional email
- An MCP-aware client — [Claude Desktop](https://claude.ai/download) or Claude Code
