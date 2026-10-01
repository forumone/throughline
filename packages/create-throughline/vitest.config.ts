import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The templates hold a scaffolded site's own tests, which run in that
    // site against its dependencies, not here.
    exclude: ['src/templates/**', 'node_modules/**'],
  },
})
