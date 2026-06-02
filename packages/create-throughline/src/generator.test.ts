import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
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
    await generate(
      makeAnswers(target, { projectName: 'acme-site' }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    const json = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as { name: string }
    expect(json.name).toBe('acme-site')
  })

  it('uses the package scope when given', async () => {
    await generate(
      makeAnswers(target, { packageScope: 'acme' }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    const webJson = JSON.parse(
      await readFile(join(target, 'apps/web/package.json'), 'utf-8'),
    ) as { name: string }
    expect(webJson.name).toBe('@acme/web')
  })

  it('falls back to a project-prefixed name when scope is blank', async () => {
    await generate(
      makeAnswers(target, { packageScope: '', projectName: 'demo' }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    const webJson = JSON.parse(
      await readFile(join(target, 'apps/web/package.json'), 'utf-8'),
    ) as { name: string }
    expect(webJson.name).toBe('demo-web')
  })

  it('wires the design-system workspace dependency into apps/web', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const webJson = JSON.parse(
      await readFile(join(target, 'apps/web/package.json'), 'utf-8'),
    ) as { dependencies: Record<string, string> }
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

  it('creates a top-level design-system Storybook authoring package', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    // Lives at the top level (a sibling of apps/), not under packages/.
    expect(existsSync(join(target, 'design-system/package.json'))).toBe(true)
    expect(existsSync(join(target, 'packages/design-system'))).toBe(false)
    // Vendored, editable component source + Storybook + Foundations.
    expect(existsSync(join(target, 'design-system/.storybook/main.ts'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/components/Hero/Hero.tsx'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/components/Hero/Hero.contract.ts'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/foundations/LayoutContainers.stories.tsx'))).toBe(true)
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
    await generate(
      makeAnswers(noScopeTarget, { packageScope: '', projectName: 'demo' }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
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
    const route = await readFile(
      join(target, 'apps/web/src/app/api/inngest/route.ts'),
      'utf-8',
    )
    expect(route).toContain('createRevalidateOnPublishFunction')
    expect(route).toContain('createExecuteScheduledPublishesFunction')
    expect(route).toContain('createExpireStaleApprovalsFunction')
    expect(route).toContain('createAuditEventEchoFunction')
    expect(route).toContain('createHealthcheckFunction')
    expect(route).toContain('getEmailFunctions')
    expect(route).toContain('getFormsFunctions')
    expect(route).toContain('getIntegrationRegistry')
    expect(route).toContain("createInngestClient({ id: 'demo' })")
  })

  it('puts the project name into the .env file', async () => {
    await generate(
      makeAnswers(target, { projectName: 'acme-site' }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
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
    await generate(
      makeAnswers(target, { useReferenceDs: false }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    const webJson = JSON.parse(
      await readFile(join(target, 'apps/web/package.json'), 'utf-8'),
    ) as { dependencies: Record<string, string> }
    expect(webJson.dependencies['@forumone/throughline-reference-ds']).toBeUndefined()
    expect(webJson.dependencies['@acme/design-system']).toBeUndefined()
  })

  it('writes a placeholder top-level design-system package + Storybook + README', async () => {
    await generate(
      makeAnswers(target, { useReferenceDs: false }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    expect(existsSync(join(target, 'design-system/package.json'))).toBe(true)
    expect(existsSync(join(target, 'design-system/src/index.ts'))).toBe(true)
    expect(existsSync(join(target, 'design-system/README.md'))).toBe(true)
    expect(existsSync(join(target, 'design-system/.storybook/main.ts'))).toBe(true)
    // No vendored reference components in the placeholder overlay.
    expect(existsSync(join(target, 'design-system/src/components/Hero/Hero.tsx'))).toBe(false)
  })

  it('uses the URL manifest config in payload.config.ts', async () => {
    await generate(
      makeAnswers(target, { useReferenceDs: false }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
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
