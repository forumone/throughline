import { defineConfig, devices } from '@playwright/test'
import { site } from './e2e/site'

/*
The smoke pack: a real server answering real requests.

The vitest suite (the `*.test.ts` files under `src`) checks values — access rules, field
validations — and connects to nothing. What it cannot reach is anything true
only of a *response*: that the admin serves a login screen, that an unknown
path is a 404 rather than a 500, that the REST API refuses an anonymous read of
`users` in practice and not only on paper. That is this.

**Deliberately not a functional suite.** It runs against an empty, migrated
database — CI's `verify` job creates one — so nothing here needs a document to
exist. Anything that does belongs in a seeded environment.

    pnpm --dir apps/web build && pnpm --dir apps/web test:smoke     # local build
    E2E_BASE_URL=https://example.org pnpm --dir apps/web test:smoke # deployed

With `E2E_BASE_URL` set the pack runs against that URL and starts no server.
Every check is a GET, which is what makes pointing it at production defensible;
adding one that writes would not be. Which routes it checks is in `e2e/site.ts`.
*/

/*
`next start`, not `next dev`: headers, caching and rendering are properties of
the built output, and a pack against `dev` would assert something nobody
deploys. So this needs `.next/` — in CI the build step has made it; locally,
run `pnpm build` first.

Hoisted, and spread in only when there is no URL to point at: with
`exactOptionalPropertyTypes` an explicit `webServer: undefined` is a type
error, and omitting the key is the only way to say "start nothing".
*/
const webServer = {
  command: `pnpm exec next start --port ${String(site.port)}`,
  url: `http://127.0.0.1:${String(site.port)}${site.home}`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',

  // A cold `next start` can lose the first request to a route while it warms.
  // Nothing here is a visual comparison, so one retry cannot hide a real failure.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  workers: 1,

  use: {
    baseURL: site.baseURL ?? `http://127.0.0.1:${String(site.port)}`,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  ...(site.baseURL ? {} : { webServer }),
})
