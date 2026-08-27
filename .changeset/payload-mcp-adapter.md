---
'@forumone/throughline-core': minor
---

Add `toPayloadMcpTool`, so Throughline's tools can be served by Payload's own MCP plugin

Payload ships `@payloadcms/plugin-mcp`, exact-pinned to the Payload version, built on the official MCP SDK: streamable HTTP, sessions, per-key per-tool capability checkboxes, and generic CRUD tools derived from the field configs. Against that, `createMcpHandler` here is a 146-line JSON-RPC subset speaking `tools/list` and `tools/call`, mounted six times over.

The transport was never the product. The tools are. This adapter is what makes moving between the two a configuration change rather than a rewrite of every tool: it translates the input schema (`withMeta`'s `z.object` to the raw shape the plugin registers), the context (a `PayloadRequest` to an `McpToolContext`), and the result (a tool's own object to MCP content blocks).

Nothing is wired to it. It is the outcome of a spike, and the servers move over one at a time.
