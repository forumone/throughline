---
'@forumone/throughline-components': patch
---

The plugin now attaches an in-process composition validator to the Payload instance under `Symbol.for('@forumone/throughline/components-validator')`. The publishing server's pipeline reads that symbol to validate compositions during the publish flow without round-tripping through the MCP transport. Adds the `'composition-validation'` capability to the plugin's registry entry.
