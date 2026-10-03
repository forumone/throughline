---
'@forumone/throughline': patch
---

`throughline-payload` fails a Payload CLI run that exits 0 without finishing.

Intermittently the Payload CLI's config `import()` never settles, and node exits
by itself with status 0 having printed nothing and done nothing
(payloadcms/payload#17757). A `migrate` that does that reports success over an
unmigrated database. Every Payload command that completes calls `process.exit`,
so the runner now preloads a guard that turns an exit nobody asked for into
status 70, with a message saying to run it again.
