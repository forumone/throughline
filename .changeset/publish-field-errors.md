---
'@forumone/throughline-publishing': minor
---

Show a blocked publish on the fields that blocked it, and stop announcing the draft save

Every publish diagnostic arrived as a toast in the corner, which left an editor reading `layout.7.image` and counting blocks. The pipeline's issues have always named their fields; they are now dispatched into form state, so the field carries the message and the collapsed block row containing it carries an error count. An issue with no field — an embargo, a missing approval — stays in the toast, which still lists everything.

Only fields the form actually has are marked, and an issue that names something deeper (a populated relationship's image, a block index) marks the nearest field that owns it. Payload's reducer creates a field state entry for any path it is handed, so an invented path would become invented data on the next save.

A field the collection itself refuses is now a failed step rather than a thrown error: `failedAt: 'execute'`, `code: 'field-validation-failed'`, with Payload's field paths as `issues`. The publishing write is the first step that enforces `required` — a draft write deliberately does not — so an empty required field inside a block is caught there and nowhere earlier. `publishDocument` and the `publish` MCP tool now return that as a result instead of throwing.

The interim draft save the Publish button performs no longer shows its own success toast. It is a step inside publishing rather than something the editor asked for, and its notice used to land on top of the publish one. Payload's own Save Draft button is untouched.
