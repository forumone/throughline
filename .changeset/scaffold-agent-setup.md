---
'@forumone/create-throughline': minor
---

A scaffolded project ships the rules an agent, or a new developer, needs:

- **`CLAUDE.md`** covers the layout, the gate in CI's own order, which files are generated and committed, how migrations and snapshots work, and the contract rule for the design system.
- **A Stop hook** (`.claude/hooks/gate.sh`) runs typecheck and lint when a session ends with pending changes. It reports, never blocks, and is silenced by `THROUGHLINE_SKIP_GATE=1`.

The README's project layout now matches what the scaffold generates.
