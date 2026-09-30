---
'@forumone/create-throughline': patch
---

The scaffolded `payload.config.ts` signs approval links with `generateActionToken` and points them at `/api/approvals/action`, the route `approvalsPlugin` serves. It used to build an unsigned query string against `/api/approvals/decision`, which nothing serves, so every button in an approval email 404'd.
