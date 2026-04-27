---
'@forumone/throughline-components': patch
---

Fix: drop the `/api` prefix from `componentsPlugin`'s default `routePrefix` so the endpoint registers at `/api/components/mcp` rather than `/api/api/components/mcp`. Payload mounts top-level endpoints under its API base (`config.routes.api`, default `/api`), which the previous default doubled. Consumers who pass an explicit `routePrefix` should also drop any leading `/api`.
