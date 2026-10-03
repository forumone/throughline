import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
import type { Answers } from './prompts.js'

/*
The tests a scaffolded site starts with: a vitest config that loads
`payload.config.ts` without a database, an access test holding every collection
to a bucket, and a Playwright smoke pack for CI's `verify` job.

None of it can run here — the access test needs every plugin's build and the
smoke pack needs a server and a database — so this checks what can be checked
without them: that the files are written and wired, and that the smoke pack and
both configs typecheck against the real `@playwright/test` and `vitest` under
the scaffold's own compiler options.
*/

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')
// Inside the package, so module resolution walks up to this package's own
// node_modules and finds the real `@playwright/test`, `vitest` and `@types/node`.
const CACHE_DIR = resolve(__dirname, '..', 'node_modules', '.cache')

const answers = (targetDir: string, useReferenceDs: boolean): Answers => ({
  targetDir,
  projectName: 'demo',
  packageScope: 'acme',
  useReferenceDs,
  initializeGit: false,
  installDeps: false,
  deploymentPlatform: 'vercel',
  databasePlatform: 'neon',
})

for (const useReferenceDs of [true, false]) {
  describe(`scaffolded tests (${useReferenceDs ? 'with' : 'without'} reference DS)`, () => {
    let workDir: string
    let target: string
    let web: { scripts: Record<string, string>; devDependencies: Record<string, string> }

    beforeAll(async () => {
      await mkdir(CACHE_DIR, { recursive: true })
      workDir = await mkdtemp(join(CACHE_DIR, 'create-throughline-tests-'))
      target = join(workDir, 'demo')
      await generate(answers(target, useReferenceDs), {
        templatesDir: TEMPLATES_DIR,
        skipSideEffects: true,
      })
      web = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as typeof web
    })

    afterAll(async () => {
      await rm(workDir, { recursive: true, force: true })
    })

    it('writes the vitest config, the access test and the smoke pack', () => {
      for (const file of [
        'apps/web/vitest.config.ts',
        'apps/web/src/access/anonymousAccess.test.ts',
        'apps/web/playwright.config.ts',
        'apps/web/e2e/site.ts',
        'apps/web/e2e/smoke.spec.ts',
      ]) {
        expect(existsSync(join(target, file)), file).toBe(true)
      }
    })

    it('wires test and test:smoke, and depends on what they run', () => {
      expect(web.scripts['test']).toBe('vitest run')
      expect(web.scripts['test:smoke']).toBe('playwright test')
      expect(web.scripts['test:smoke:install']).toContain('playwright install')
      expect(web.devDependencies['vitest']).toBeDefined()
      expect(web.devDependencies['@playwright/test']).toBeDefined()
    })

    it('loads the config with placeholders for every variable CI sets, and no real database', async () => {
      const vitestConfig = await readFile(join(target, 'apps/web/vitest.config.ts'), 'utf-8')
      const workflow = await readFile(join(target, '.github/workflows/ci.yml'), 'utf-8')
      const ciVariables = [...workflow.matchAll(/^ {2}([A-Z][A-Z_]+): /gm)].map((m) => m[1]!)
      expect(ciVariables.length).toBeGreaterThan(5)
      for (const name of ciVariables) expect(vitestConfig, name).toContain(`${name}:`)
      expect(vitestConfig).toContain('does-not-exist')
      expect(vitestConfig).toContain("'@payload-config'")
    })

    it('buckets every collection the scaffold has, once', async () => {
      const test = await readFile(
        join(target, 'apps/web/src/access/anonymousAccess.test.ts'),
        'utf-8',
      )
      const slugs = [...test.matchAll(/^ {4}'?([a-z][\w-]*)'?: '/gm)].map((m) => m[1]!)
      // The scaffold's two, and what the plugins and Payload add — measured by
      // building the config. The test in the scaffold is what keeps this true
      // once the site starts adding collections.
      expect([...slugs].sort()).toEqual(
        [
          'approvals',
          'audit-events',
          'integrations',
          'job-failures',
          'pages',
          'payload-kv',
          'payload-locked-documents',
          'payload-mcp-api-keys',
          'payload-migrations',
          'payload-preferences',
          'users',
        ].sort(),
      )
    })

    it('gives pages a read rule, so the render path is not refused by default', async () => {
      const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
      expect(config).toContain('access: { read: publishedOrSignedIn }')
      expect(config).toContain("{ _status: { equals: 'published' } }")
    })

    it('runs the smoke pack in verify, after the build, and not in fast', async () => {
      const workflow = await readFile(join(target, '.github/workflows/ci.yml'), 'utf-8')
      const verify = workflow.slice(workflow.indexOf('\n  verify:'))
      const fast = workflow.slice(0, workflow.indexOf('\n  verify:'))
      expect(fast).not.toContain('test:smoke')
      expect(verify.indexOf('run: pnpm build')).toBeGreaterThan(0)
      expect(verify.indexOf('test:smoke:install')).toBeGreaterThan(
        verify.indexOf('run: pnpm build'),
      )
      expect(verify.indexOf('run: pnpm --dir apps/web test:smoke\n')).toBeGreaterThan(
        verify.indexOf('test:smoke:install'),
      )
    })

    it('ignores Playwright output', async () => {
      const gitignore = await readFile(join(target, '.gitignore'), 'utf-8')
      expect(gitignore).toContain('e2e/.results/')
    })

    // A whole program over Playwright's and vitest's types: seconds, not milliseconds.
    it('typechecks the smoke pack and both configs under the scaffold compiler options', () => {
      const tsconfigPath = join(target, 'apps/web/tsconfig.json')
      const { config } = ts.readConfigFile(tsconfigPath, (path) => ts.sys.readFile(path))
      const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(tsconfigPath))
      const files = [
        'apps/web/playwright.config.ts',
        'apps/web/vitest.config.ts',
        'apps/web/e2e/site.ts',
        'apps/web/e2e/smoke.spec.ts',
      ].map((file) => join(target, file))

      const program = ts.createProgram(files, {
        ...parsed.options,
        // Next's language-service plugin and incremental state mean nothing to
        // a one-off program.
        plugins: [],
        incremental: false,
        noEmit: true,
        types: ['node'],
      })
      const messages = ts
        .getPreEmitDiagnostics(program)
        .map(
          (d) =>
            `${d.file?.fileName ?? ''}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
        )
      expect(messages).toEqual([])
    }, 60_000)
  })
}
