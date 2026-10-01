---
'@forumone/throughline-core': minor
---

Adds a `./testing` subpath with `describeAnonymousAccess(config, buckets)`. It registers a vitest suite that checks every collection's `read` rule against an anonymous request, with no database. Every collection in the config, including those added by plugins and by Payload, must be in exactly one bucket:

- `renderPath`: read by the public site, so an anonymous read must be allowed. A collection with drafts must narrow that read with a query.
- `private`: an anonymous read must be refused.

A collection in no bucket fails, so adding a collection fails until somebody decides where it goes. `checkAnonymousAccess` returns the same findings as a list. `vitest` is an optional peer, and the main entry does not re-export the subpath.
