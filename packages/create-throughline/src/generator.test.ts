import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
import { readWorkspaceVersions } from './utils/versions.js'
import type { Answers } from './prompts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')

function makeAnswers(targetDir: string, overrides: Partial<Answers> = {}): Answers {
  return {
    targetDir,
    projectName: 'demo',
    packageScope: 'acme',
    useReferenceDs: true,
    initializeGit: false,
    installDeps: false,
    deploymentPlatform: 'vercel',
    databasePlatform: 'neon',
    ...overrides,
  }
}

describe('generate (with reference DS)', () => {
  let workDir: string
  let target: string

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-'))
    target = join(workDir, 'demo')
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('creates the expected top-level files', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })

    expect(existsSync(join(target, 'package.json'))).toBe(true)
    expect(existsSync(join(target, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(target, 'turbo.json'))).toBe(true)
    expect(existsSync(join(target, '.env.example'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(target, 'README.md'))).toBe(true)
    expect(existsSync(join(target, '.gitignore'))).toBe(true)
  })

  it('strips the .template suffix on rendered files', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })

    expect(existsSync(join(target, 'package.json'))).toBe(true)
    expect(existsSync(join(target, 'package.json.template'))).toBe(false)
    expect(existsSync(join(target, 'apps/web/package.json'))).toBe(true)
    expect(existsSync(join(target, 'apps/web/src/payload.config.ts'))).toBe(true)
    expect(existsSync(join(target, 'apps/web/src/payload.config.ts.template'))).toBe(false)
  })

  it('substitutes projectName into package.json', async () => {
    await generate(makeAnswers(target, { projectName: 'acme-site' }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const json = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      name: string
    }
    expect(json.name).toBe('acme-site')
  })

  it('uses the package scope when given', async () => {
    await generate(makeAnswers(target, { packageScope: 'acme' }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const webJson = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
      name: string
    }
    expect(webJson.name).toBe('@acme/web')
  })

  it('falls back to a project-prefixed name when scope is blank', async () => {
    await generate(makeAnswers(target, { packageScope: '', projectName: 'demo' }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const webJson = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
      name: string
    }
    expect(webJson.name).toBe('demo-web')
  })

  it('pins every Throughline package to its current workspace version', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const current = await readWorkspaceVersions(resolve(__dirname, '..', '..'))
    const ranges: Array<[string, string]> = []
    for (const file of ['apps/web/package.json', 'design-system/package.json']) {
      const json = JSON.parse(await readFile(join(target, file), 'utf-8')) as {
        dependencies?: Record<string, string>
      }
      for (const [name, range] of Object.entries(json.dependencies ?? {})) {
        if (name === '@forumone/throughline' || name.startsWith('@forumone/throughline-')) {
          ranges.push([name, range])
        }
      }
    }
    // Eight in apps/web (@forumone/throughline, six plugins still outside it,
    // and design-contract), one in the design system. Falls as the 1.0
    // consolidation folds each plugin in.
    expect(ranges).toHaveLength(9)
    // A hand-typed range left them at ^0.2.0 — patches only, for a 0.x version —
    // while the packages reached 0.9. Every range must be read, not typed.
    for (const [name, range] of ranges) {
      expect(range, name).toBe(`^${current[name]}`)
    }
  })

  it('runs every Payload CLI script through the bounded runner', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const webJson = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
    }
    const rootJson = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>
    }

    // A bare `payload` behind pnpm outlives a killed shell and can spin on a
    // core forever. The runner ships as a bin of @forumone/throughline.
    expect(webJson.dependencies['@forumone/throughline']).toBeDefined()
    expect(webJson.scripts).toMatchObject({
      payload: 'throughline-payload',
      'payload:reap': 'throughline-payload --reap',
      'generate:types': 'throughline-payload generate:types',
      'generate:importmap': 'throughline-payload generate:importmap',
      migrate: 'PAYLOAD_MIGRATING=1 throughline-payload migrate',
      'migrate:create': 'throughline-payload migrate:create',
      'migrate:status': 'throughline-payload migrate:status',
    })
    for (const [name, script] of Object.entries(webJson.scripts)) {
      expect(script, name).not.toMatch(/(^|[\s=&;|])payload(\s|$)/)
    }
    expect(rootJson.scripts['payload:reap']).toBe('pnpm --dir apps/web run payload:reap')
    expect(await readFile(join(target, '.gitignore'), 'utf-8')).toMatch(/^\.payload-cli-pids$/m)
  })

  it('wires the design-system workspace dependency into apps/web', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const webJson = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
      dependencies: Record<string, string>
    }
    expect(webJson.dependencies['@acme/design-system']).toBe('workspace:*')
    // The npm reference-ds package is vendored, not depended on.
    expect(webJson.dependencies['@forumone/throughline-reference-ds']).toBeUndefined()
  })

  it('imports the design-system manifest in payload.config.ts', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    expect(config).toContain("from '@acme/design-system/manifest'")
    expect(config).toContain('designSystemManifest')
    expect(config).not.toContain('your-design-system.example.com')
  })

  it("names the manifest from the project's design system, not the reference one", async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const script = await readFile(join(target, 'design-system/scripts/build-manifest.ts'), 'utf-8')
    // The vendored script once hard-coded `@forumone/throughline-reference-ds`,
    // so every scaffolded project published a manifest claiming to be it.
    expect(script).not.toContain("'@forumone/throughline-reference-ds'")
    expect(script).toContain('designSystem: await readPackage()')
  })

  it('signs approval links and points them at the route approvalsPlugin serves', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    // `buildActionUrl` from approvals targets `/api/approvals/action`, the
    // endpoint the plugin registers. The template once built an unsigned
    // query string against `/api/approvals/decision`, which nothing serves.
    expect(config).toContain('generateActionToken(')
    expect(config).toContain('buildActionUrl(process.env.NEXT_PUBLIC_SERVER_URL!, token)')
    expect(config).toContain("from '@forumone/throughline-approvals'")
    expect(config).not.toContain('/api/approvals/decision')
  })

  it('creates a top-level design-system Storybook authoring package', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    // Lives at the top level (a sibling of apps/), not under packages/.
    expect(existsSync(join(target, 'design-system/package.json'))).toBe(true)
    expect(existsSync(join(target, 'packages/design-system'))).toBe(false)
    // Vendored, editable component source + Storybook + Foundations.
    expect(existsSync(join(target, 'design-system/.storybook/main.ts'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/components/Hero/Hero.tsx'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/components/Hero/Hero.contract.ts'))).toBe(
      true,
    )
    expect(
      existsSync(join(target, 'design-system/src/foundations/LayoutContainers.stories.tsx')),
    ).toBe(true)
    // .gitignore is authored as `gitignore` and restored on output.
    expect(existsSync(join(target, 'design-system/.gitignore'))).toBe(true)
    expect(existsSync(join(target, 'design-system/gitignore'))).toBe(false)
  })

  it('names the design-system package from the scope (or project name)', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const scoped = JSON.parse(
      await readFile(join(target, 'design-system/package.json'), 'utf-8'),
    ) as { name: string }
    expect(scoped.name).toBe('@acme/design-system')

    const noScopeTarget = join(dirname(target), 'noscope')
    await generate(makeAnswers(noScopeTarget, { packageScope: '', projectName: 'demo' }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const unscoped = JSON.parse(
      await readFile(join(noScopeTarget, 'design-system/package.json'), 'utf-8'),
    ) as { name: string }
    expect(unscoped.name).toBe('demo-design-system')
  })

  it('adds storybook + validate scripts and lists design-system in the workspace', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const rootJson = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>
    }
    expect(rootJson.scripts.storybook).toBeDefined()
    expect(rootJson.scripts['build-storybook']).toBeDefined()
    expect(rootJson.scripts.validate).toBeDefined()
    const workspace = await readFile(join(target, 'pnpm-workspace.yaml'), 'utf-8')
    expect(workspace).toContain('design-system')
  })

  it('inngest endpoint registers all framework functions', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const route = await readFile(join(target, 'apps/web/src/app/api/inngest/route.ts'), 'utf-8')
    expect(route).toContain('...jobs.functions([')
    expect(route).toContain('revalidateOnPublishJob(')
    expect(route).toContain('executeScheduledPublishesJob(')
    expect(route).toContain('publishAtScheduledTimeJob(')
    expect(route).toContain('expireStaleApprovalsJob(')
    expect(route).toContain('auditEventEchoJob(')
    expect(route).toContain('healthcheckJob(')
    expect(route).toContain('getEmailFunctions')
    expect(route).toContain('getFormsFunctions')
    expect(route).toContain('getIntegrationRegistry')
    expect(route).toContain("createInngestClient({ id: 'demo' })")
  })

  /*
  revalidate-on-publish has no built-in URL builders, so a scaffold that passed
  none would revalidate no page path at all. And a tag has two ends: the hooks,
  the workflow and the readers all have to build it from the one scheme.
  */
  it('wires cache revalidation to one tag scheme, with explicit URL builders', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const route = await readFile(join(target, 'apps/web/src/app/api/inngest/route.ts'), 'utf-8')
    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    const tags = await readFile(join(target, 'apps/web/src/lib/cache-tags.ts'), 'utf-8')

    expect(tags).toContain("from '@forumone/throughline/cache-tags'")
    expect(tags).toContain('export const cacheTags = createCacheTags(')
    expect(route).toContain("import { cacheTags } from '@/lib/cache-tags'")
    expect(route).toContain('revalidateOnPublishJob({ urlBuilders, cacheTags })')
    expect(route).toMatch(/const urlBuilders = \{\s+pages:/)
    expect(config).toContain("import { cacheTags } from './lib/cache-tags'")
    expect(config).toContain('createTagRevalidationHooks({ cacheTags })')
    expect(config).toContain('afterChange: [revalidation.afterCollectionChange()]')
    expect(config).toContain('afterDelete: [revalidation.afterCollectionDelete()]')
  })

  it('routes failures: workflows, healthchecks and request errors', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const route = await readFile(join(target, 'apps/web/src/app/api/inngest/route.ts'), 'utf-8')
    expect(route).toContain('const onTerminalFailure = createTerminalFailureHandler({ payload })')
    expect(route).toContain('onFailure: createHealthcheckFailureHandler({ payload })')
    // Every platform job gets the handler, through the adapter: declared once, used once.
    expect(route).toContain('inngestJobs(inngest, { onFailure: onTerminalFailure, payload })')
    expect(route.match(/onTerminalFailure[,\s}]/g)?.length).toBe(1 + 1)

    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    expect(config).toContain('jobFailuresPlugin({})')

    const instrumentation = await readFile(join(target, 'apps/web/src/instrumentation.ts'), 'utf-8')
    expect(instrumentation).toContain('export const onRequestError')
    expect(instrumentation).toContain("from '@forumone/throughline/observability'")

    const env = await readFile(join(target, '.env.example'), 'utf-8')
    expect(env).toMatch(/^ERROR_WEBHOOK_URL=$/m)
  })

  it('puts the project name into the .env file', async () => {
    await generate(makeAnswers(target, { projectName: 'acme-site' }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const env = await readFile(join(target, '.env.example'), 'utf-8')
    expect(env).toContain('EMAIL_FROM_NAME=acme-site')
  })
})

describe('generate (without reference DS)', () => {
  let workDir: string
  let target: string

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-'))
    target = join(workDir, 'demo')
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('omits any design-system dependency from apps/web', async () => {
    await generate(makeAnswers(target, { useReferenceDs: false }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const webJson = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
      dependencies: Record<string, string>
    }
    expect(webJson.dependencies['@forumone/throughline-reference-ds']).toBeUndefined()
    expect(webJson.dependencies['@acme/design-system']).toBeUndefined()
  })

  it('writes a placeholder top-level design-system package + Storybook + README', async () => {
    await generate(makeAnswers(target, { useReferenceDs: false }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    expect(existsSync(join(target, 'design-system/package.json'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/index.ts'))).toBe(true)
    expect(existsSync(join(target, 'design-system/README.md'))).toBe(true)
    expect(existsSync(join(target, 'design-system/.storybook/main.ts'))).toBe(true)
    // No vendored reference components in the placeholder overlay.
    expect(existsSync(join(target, 'design-system/src/components/Hero/Hero.tsx'))).toBe(false)
  })

  it('uses the URL manifest config in payload.config.ts', async () => {
    await generate(makeAnswers(target, { useReferenceDs: false }), {
      templatesDir: TEMPLATES_DIR,
      skipSideEffects: true,
    })
    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    expect(config).toContain('your-design-system.example.com')
    expect(config).not.toContain("from '@forumone/throughline-reference-ds/manifest'")
  })
})

describe('vendored design-system template safety', () => {
  // The renderer treats `{{word}}` / `{{#if}}` as template syntax. Vendored
  // reference-DS source must not contain those patterns, or scaffolding would
  // corrupt component files (React inline styles `style={{ ... }}` are safe —
  // they contain spaces/colons and never match `{{word}}`).
  const vendoredRoot = resolve(TEMPLATES_DIR, 'with-reference-ds/design-system')
  const dangerous = /\{\{(?:\w+)\}\}|\{\{#if|\{\{\/if|\{\{else\}\}/

  it('contains no renderer-colliding handlebars patterns', async () => {
    const { readdir } = await import('node:fs/promises')
    async function walk(dir: string): Promise<string[]> {
      const out: string[] = []
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...(await walk(full)))
        // Skip the one intentionally-templated file.
        else if (entry.isFile() && !entry.name.endsWith('.template')) out.push(full)
      }
      return out
    }
    const offenders: string[] = []
    for (const file of await walk(vendoredRoot)) {
      const text = await readFile(file, 'utf-8')
      if (dangerous.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

describe('workspace gates', () => {
  let workDir: string

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-gates-'))
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  const GATES = {
    'check:instances': 'scripts/check-single-instance.ts',
    'check:tested': 'scripts/check-tested-packages.ts',
    'check:audit': 'scripts/check-audit.ts',
  }

  for (const useReferenceDs of [true, false]) {
    describe(useReferenceDs ? 'with reference DS' : 'without reference DS', () => {
      it('ships each gate script, wired to a root script, and parseable once rendered', async () => {
        const target = join(workDir, 'demo')
        await generate(makeAnswers(target, { useReferenceDs }), {
          templatesDir: TEMPLATES_DIR,
          skipSideEffects: true,
        })
        const root = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
          scripts: Record<string, string>
          devDependencies: Record<string, string>
        }
        expect(root.devDependencies['tsx']).toBeDefined()

        for (const [script, file] of Object.entries(GATES)) {
          expect(root.scripts[script]).toBe(`tsx ${file}`)
          const source = await readFile(join(target, file), 'utf-8')
          const { diagnostics = [] } = ts.transpileModule(source, {
            reportDiagnostics: true,
            fileName: file,
          })
          const messages = diagnostics.map((d) =>
            ts.flattenDiagnosticMessageText(d.messageText, '\n'),
          )
          expect(messages, file).toEqual([])
        }
      })

      it('starts check:tested with exactly the scaffolded packages that have no tests yet', async () => {
        const target = join(workDir, 'demo')
        await generate(makeAnswers(target, { useReferenceDs }), {
          templatesDir: TEMPLATES_DIR,
          skipSideEffects: true,
        })
        const source = await readFile(join(target, GATES['check:tested']), 'utf-8')
        // apps/web ships its access test, so an entry for it would be stale on
        // day one — and the gate fails a stale entry.
        expect(source).not.toContain("'apps/web':")
        expect(existsSync(join(target, 'apps/web/src/access/anonymousAccess.test.ts'))).toBe(true)
        // The reference DS ships tests; the placeholder has source and none.
        if (useReferenceDs) expect(source).not.toContain("'design-system':")
        else expect(source).toContain("'design-system':")
      })
    })
  }
})
