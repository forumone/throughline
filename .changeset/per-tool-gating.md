---
'@forumone/throughline-integrations': minor
'@forumone/throughline-publishing': minor
'@forumone/throughline-components': minor
'@forumone/throughline-approvals': minor
'@forumone/throughline-audit': minor
'@forumone/throughline-forms': minor
'@forumone/throughline-core': minor
---

Per-tool gating works, because tool names no longer wait for `onInit`

`@payloadcms/plugin-mcp` generates one per-key checkbox per tool while the host's
config is being built, and then gates every call on the checkbox matching the
tool's name. Every Throughline tool was built at `onInit` — each closes over
`payload`, the publishing service or the manifest loader — so the array it maps
over was empty, no checkboxes were generated, and its `?? false` denied all 27
tools to every key. A valid key got a 200 and an empty `tools/list`, with nothing
wrong on either side.

The plugin needs only `name` and `description` then, and neither needs a Payload.
So a server now **declares** its tools as the config is built and **binds** their
handlers at `onInit`:

```ts
options.mcpTools?.declare(PUBLISHING_TOOL_DESCRIPTORS, { serverName: 'publishing' })
// …later, at onInit:
options.mcpTools?.add(tools, { serverName: 'publishing' })
```

Each package gained a `tools/descriptors.ts` holding every tool's name and
description; the factories spread from it, so the checkbox and the MCP client
cannot describe a tool differently. A `descriptors.test.ts` in each package
asserts the two sets match, without needing a database.

`createMcpToolCollector` gains `declare()` and an `unbound` list. Both mismatches
are refused rather than absorbed: a tool built but never declared throws at
`onInit` (it would otherwise be denied to every key, silently), and a tool
declared but never bound stays advertised with a handler that explains itself.

**Order in the host's plugin array is now load-bearing.** Every tool-bearing
server must come before `mcpPlugin`, or it declares into an array that has
already been read. It was only a convention before; it is a requirement now, and
the failure mode — a server's tools missing from every key — is the one this
change exists to remove.

`requiredScope` stays declared and read by nothing. Enforcement is the checkbox;
these record which tools are consequential, and are the mapping a scope-aware
default would be built from.

The playground registers `mcpPlugin` for the first time, so the suite's only
end-to-end host now exercises the tools rather than just their composition.
