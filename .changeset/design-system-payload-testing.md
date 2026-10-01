---
'@forumone/throughline-design-system-payload': minor
---

Adds test helpers for a site's generated blocks, on a new `./testing` subpath. `vitest` is an optional peer.

- `describeBlockInvariants(blocks, options?)` checks two things. First, every generated `validate` must accept the data Payload stores for a newly added block, both with no array rows and with one empty row. Second, every generated checkbox must start at its contract's `defaultValue`, and no generated text field may have a string default. It accepts `generateBlocks` output, or plain blocks together with the manifest.
- The `check-block-props` bin takes a manifest, one or more component directories and an optional `--overrides` module. It coerces each contract through `coerceBlock` and compares the resulting prop shapes with the component's `<Name>Args.ts`. It exits non-zero on a mismatch, and also when there were no args files to compare against.
