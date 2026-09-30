---
'@forumone/create-throughline': minor
---

A scaffolded project ships three workspace gates as root scripts:

- `check:instances`: `payload`, `@payloadcms/ui`, `react` and `react-dom` each resolve to exactly one copy
- `check:tested`: every package that ships code has at least one test
- `check:audit`: production advisories are checked against an allowlist that carries a reason for each entry and fails when an entry goes stale
