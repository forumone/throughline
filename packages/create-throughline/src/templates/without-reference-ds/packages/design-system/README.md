# {{projectName}} design system

This is a placeholder for your design system. The Components MCP server in `apps/web/src/payload.config.ts` is configured to read a manifest URL — replace the `https://your-design-system.example.com/manifest.json` value with your real DS's manifest endpoint.

## What the manifest needs to contain

A list of components, each with:

- `name`, `description`, `categories`
- `props` schema (Zod-compatible JSON description)
- `slots` (named regions)
- `tokens` (CSS variables / brand tokens consumed)
- `examples` (sample inputs Claude can learn from)

See `@forumone/throughline-design-contract` for the full schema.

## Quickest path

If you just want to start moving, `pnpm create @forumone/throughline` again and answer "yes" to the reference design system. You'll get a working setup you can study, swap components in, and slowly replace.
