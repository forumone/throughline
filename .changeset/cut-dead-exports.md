---
'@forumone/throughline-core': minor
'@forumone/throughline-plugin-contract': minor
---

Stop publishing code nothing imports

`@forumone/throughline-core` loses three things no package in the suite, and no consumer, has ever called:

- **`./env`** — `ENV_VARS`, `validateBaseEnv`, `requireEnv`, `optionalEnv`, and the subpath export that served them. The idea was that plugins would read `process.env` through shared constants instead of hard-coded strings; every plugin hard-codes the string, including the ones in this repo. A convention with no adherents is not a convention.
- **`shallowDiff`** — written for the audit writer's `diff` field, never wired to it. The writer still takes a caller-supplied diff, and Payload's own version diffing is the better answer if one is ever wanted.
- **`generateId`** — an id generator in a framework where Payload assigns the ids.

`@forumone/throughline-plugin-contract` stops shipping `examplePlugin`. It is documentation of a shape, and it now lives in the playground, which is where a shape gets demonstrated — the published package was carrying 74 lines of example for every consumer that installs it.

Removing exports from a published package, hence minor rather than patch. Nothing in this repository, and nothing in the suite's only consumer, imports any of it.
