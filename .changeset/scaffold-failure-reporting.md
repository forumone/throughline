---
'@forumone/create-throughline': minor
---

A scaffolded project reports its failures. `apps/web/src/instrumentation.ts` sends unhandled request errors to `ERROR_WEBHOOK_URL` through core's reporter, and warns at boot when that variable is unset. The Inngest route passes `createTerminalFailureHandler` to every framework workflow and `createHealthcheckFailureHandler` to the healthcheck. `payload.config.ts` registers `jobFailuresPlugin`. `.env.example` lists `ERROR_WEBHOOK_URL` as optional.

A new project's first migration includes the `job-failures` table. An existing project that copies these changes needs `payload migrate:create`.
