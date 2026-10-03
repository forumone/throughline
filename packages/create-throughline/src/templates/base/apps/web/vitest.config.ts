import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))

/*
The cheap tier: vitest in node, with no database and no browser.

Everything here is an invariant over values — the access rules, field
validations, hooks as functions — and `payload.config.ts` is imported, never
connected. That is what lets these run on every pull request, in CI's `fast`
job, which has no database. Anything that needs one belongs in `verify`, and
anything true only of a real response belongs in the smoke pack (`e2e/`).

`environment: 'node'`, deliberately: nothing in `apps/web` renders here. The
components live in the design system, whose own suite runs them.
*/
export default defineConfig({
  /*
  The two aliases `tsconfig.json` declares. Next resolves them from that file
  and vitest does not, so a module importing `@/lib/…` or `@payload-config`
  cannot be loaded here unless they are repeated.
  */
  resolve: {
    alias: {
      '@payload-config': path.join(here, 'src/payload.config.ts'),
      '@': path.join(here, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /*
    Enough for `payload.config.ts` to load, and nothing more.

    The plugins check their secrets when the config is built, so importing it
    needs every value present. None is a credential: the secrets are padded
    placeholders, the address is under `.invalid`, which RFC 2606 reserves so
    it can never resolve, and the connection string names a database nobody
    has. That is safe because the config *parses* the string and never
    connects — the same fact CI's `fast` job relies on.

    Set here rather than left to the shell, so `pnpm test` needs no setup and a
    `DATABASE_URI` somebody exported for a migration cannot reach a test.
    */
    env: {
      DATABASE_URI: 'postgres://test:test@localhost:5432/does-not-exist',
      PAYLOAD_SECRET: 'test-only-not-a-real-secret-000000000000',
      APPROVAL_TOKEN_SECRET: 'test-only-not-a-real-secret-000000000000',
      RESEND_API_KEY: 're_test_only_not_a_real_key',
      EMAIL_FROM_ADDRESS: 'test-only@example.invalid',
      NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
    },
  },
})
