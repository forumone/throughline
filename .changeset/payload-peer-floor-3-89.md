---
'@forumone/throughline-core': minor
'@forumone/throughline-plugin-contract': minor
'@forumone/throughline-audit': minor
'@forumone/throughline-approvals': minor
'@forumone/throughline-components': minor
'@forumone/throughline-email': minor
'@forumone/throughline-forms': minor
'@forumone/throughline-integrations': minor
'@forumone/throughline-publishing': minor
'@forumone/throughline-workflows': minor
'@forumone/throughline-design-system-payload': minor
---

The `payload` peer range moves from `^3.0.0` to `^3.89.0` for every package that has one. **A site on Payload older than 3.89.0 must upgrade Payload before upgrading these packages.**

Before 3.89.0, the `payload-mcp-api-keys` collection that `@payloadcms/plugin-mcp` adds registered Payload's API-key strategy on every REST route. Any key could then become `req.user` outside `/api/mcp` and pass access rules written as `Boolean(req.user)`. Every Throughline site runs that plugin, so the floor is the same for every package. No package's code changes with this bump.
