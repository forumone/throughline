# Spec

> **Historical.** These are the build plans as written, kept as the record of what was intended and why. They are not maintained. Where one disagrees with [the reference](../reference/) or the code, the reference and the code are right. The C-phase plans name packages `@forumone/claude-cms-*` and describe the 0.x package-per-plugin layout; 1.0 is three packages and one `throughline()` call.

## The original build plan

- [00-README.md](00-README.md) — Claude-First CMS: the two-track structure, the phases and the dependency map
- [C0](C0-monorepo-scaffold.md) — Monorepo scaffold
- [C1](C1-plugin-architecture.md) — Plugin architecture
- [C2](C2-design-contract.md) — Design contract package
- [C3](C3-reference-ds.md) — Reference design system
- [C4](C4-core-plumbing.md) — Core plumbing package
- [C5](C5-component-server.md) — Component server
- [C6](C6-publishing-server.md) — Publishing server
- [C7](C7-approvals-server.md) — Approvals server
- [C8](C8-audit-query-server.md) — Audit query server
- [C9](C9-integrations-server.md) — Integrations server
- [C10](C10-workflows.md) — Workflows package
- [C11](C11-email.md) — Email package
- [C12](C12-forms.md) — Forms package
- [C13](C13-cli.md) — CLI scaffolder
- [C14](C14-docs.md) — Documentation

## Throughline 1.0

- [1.0-plan.md](1.0-plan.md) — Throughline 1.0
- [1.0-exports.md](1.0-exports.md) — where every 0.x export goes
- [1.0-throughline-call.md](1.0-throughline-call.md) — `throughline()`: one call for the whole suite
