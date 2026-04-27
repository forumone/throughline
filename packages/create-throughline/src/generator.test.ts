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

  it('wires the reference DS dependency into apps/web', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const webJson = JSON.parse(
      await readFile(join(target, 'apps/web/package.json'), 'utf-8'),
    ) as { dependencies: Record<string, string> }
    expect(webJson.dependencies['@forumone/throughline-reference-ds']).toBeDefined()
  })

  it('imports the reference manifest in payload.config.ts', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    expect(config).toContain("from '@forumone/throughline-reference-ds/manifest'")
    expect(config).toContain('referenceManifest')
    expect(config).not.toContain('your-design-system.example.com')
  })

  it('creates the design-system overlay package', async () => {
    await generate(makeAnswers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    expect(existsSync(join(target, 'packages/design-system/package.json'))).toBe(true)
    expect(existsSync(join(target, 'packages/design-system/src/index.ts'))).toBe(true)
    expect(existsSync(join(target, 'packages/design-system/src/manifest.ts'))).toBe(true)
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

  it('omits the reference DS dependency from apps/web', async () => {
    await generate(
      makeAnswers(target, { useReferenceDs: false }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    const webJson = JSON.parse(
      await readFile(join(target, 'apps/web/package.json'), 'utf-8'),
    ) as { dependencies: Record<string, string> }
    expect(webJson.dependencies['@forumone/throughline-reference-ds']).toBeUndefined()
  })

  it('writes the placeholder design-system package + README', async () => {
    await generate(
      makeAnswers(target, { useReferenceDs: false }),
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    expect(existsSync(join(target, 'packages/design-system/package.json'))).toBe(true)
    expect(existsSync(join(target, 'packages/design-system/src/index.ts'))).toBe(true)
    expect(existsSync(join(target, 'packages/design-system/README.md'))).toBe(true)
    // No manifest re-export in the placeholder overlay.
    expect(existsSync(join(target, 'packages/design-system/src/manifest.ts'))).toBe(false)
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
