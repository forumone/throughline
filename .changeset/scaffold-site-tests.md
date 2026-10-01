---
'@forumone/create-throughline': minor
---

A scaffolded project now starts with tests in `apps/web`:

- **Vitest.** `vitest.config.ts` loads `payload.config.ts` with placeholder variables and no database. `src/access/anonymousAccess.test.ts` uses `describeAnonymousAccess` to put every collection the project has into an access bucket. `pnpm test` runs it in CI's `fast` job. `check:tested` drops its exception for `apps/web`.
- **Playwright smoke pack.** `e2e/` runs against `next start`, or against `E2E_BASE_URL`. It checks the front door, a 404, the admin sign-in screen, and anonymous REST reads. The paths are in `e2e/site.ts`, along with the checks a new project cannot pass yet because it does not serve the routes they test. It runs in CI's `verify` job after the build. The new scripts are `test`, `test:smoke` and `test:smoke:install`.
- **`pages` read rule.** The example `pages` collection gains a published-or-signed-in `read` rule. Before, Payload's default refused every anonymous read, so the public site could never read a page.
