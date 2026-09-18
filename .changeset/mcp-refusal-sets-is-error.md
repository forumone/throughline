---
'@forumone/throughline-core': patch
---

A refused MCP tool call now carries MCP's `isError` flag.

Every server in the suite answers a refusal with `{ error: … }` and returns it
rather than throwing, so that a denial reads to the model as a denial rather
than as a server fault. None of them set `isError`, so the refusal arrived as a
**successful** tool result that happened to contain an `error` key: a client
checking the protocol's flag instead of parsing the body read every refusal as
a success.

The publishing tools are where this was found, and they are the worst case for
it. `@payloadcms/plugin-mcp` assigns no `req.user` — it mutates `docs[0].user`
and passes it separately to its own CRUD tools — so `contextFrom(req)` reads
`null` and *every* `Bearer`-authenticated publishing call is refused at
`actor.ts`'s identity guard. All of those refusals reported success.

Fixed in `toPayloadMcpTool`, which is the one adapter every tool in all six
servers passes through, so a tool written tomorrow is covered without its
author knowing the file exists.

**Nothing changes for a client that parses the body.** The content block is
byte-identical, and `isError` is absent rather than `false` on a success, so a
consumer reading `{ error }` today sees no difference. A consumer reading the
flag now sees the truth instead of its opposite.

The test is a non-empty string `error`, so a refusal that later grows a second
field — a code, a retry hint — keeps its flag. The corollary is now documented
on `deniedEnvelope`: `error` is reserved for refusals, and a success result
reports failure through `ok`, `healthy`, `message` or `details`.

Found exercising audit `04` F-02 against a real MCP key; forumone-2026#614.
