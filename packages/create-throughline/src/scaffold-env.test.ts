import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generate } from './generator.js'

/*
The scaffold checks its whole environment once, at the top of payload.config.ts,
with every plugin's declared requirements plus its own — and every variable that
check can demand has to be somewhere a developer and CI will find it.

The plugins' declarations are read from their source, statically, as
scaffold-imports.test.ts reads exports: this package does not depend on them,
and the test needs no build.
*/

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')
const PACKAGES_DIR = resolve(__dirname, '..', '..')

interface Declared {
  name: string
  minLength?: number
}

/** `const X_ENV = { name: '…', minLength: N | IDENT, … } as const satisfies EnvRequirement` */
function declarationsIn(source: string): Declared[] {
  const constants = new Map(
    [...source.matchAll(/const ([A-Z_]+) = (\d+)\b/g)].map((m) => [m[1]!, Number(m[2])]),
  )
  return [
    ...source.matchAll(
      /\{\s*name: '([A-Z][A-Z0-9_]*)',\s*(?:minLength: (\w+),\s*)?why:[\s\S]*?\} as const satisfies EnvRequirement/g,
    ),
  ].map((m) => {
    const raw = m[2]
    if (raw === undefined) return { name: m[1]! }
    const minLength = /^\d+$/.test(raw) ? Number(raw) : constants.get(raw)
    if (minLength === undefined) throw new Error(`cannot resolve minLength ${raw} for ${m[1]}`)
    return { name: m[1]!, minLength }
  })
}

const PLUGIN_LISTS = {
  approvalsEnv: 'approvals',
  emailEnv: 'email',
  formsEnv: 'forms',
} as const

describe('the scaffold checks its environment at startup', () => {
  let workDir: string
  let config: string
  let envExample: string
  let workflow: string
  let required: Declared[]

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-env-'))
    const target = join(workDir, 'demo')
    await generate(
      {
        targetDir: target,
        projectName: 'demo',
        packageScope: 'acme',
        useReferenceDs: true,
        initializeGit: false,
        installDeps: false,
        deploymentPlatform: 'vercel',
        databasePlatform: 'neon',
      },
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    envExample = await readFile(join(target, '.env.example'), 'utf-8')
    workflow = await readFile(join(target, '.github/workflows/ci.yml'), 'utf-8')

    const fromPlugins: Declared[] = []
    for (const pkg of Object.values(PLUGIN_LISTS)) {
      const source = await readFile(join(PACKAGES_DIR, pkg, 'src', 'options.ts'), 'utf-8')
      const found = declarationsIn(source)
      expect(found.length, `${pkg} declares its environment`).toBeGreaterThan(0)
      fromPlugins.push(...found)
    }
    const call = /assertEnvironment\(([\s\S]*?)\n\)/.exec(config)?.[1] ?? ''
    const fromSite = [...call.matchAll(/name: '([A-Z][A-Z0-9_]*)',(?:\s*minLength: (\d+),)?/g)].map(
      (m) => ({ name: m[1]!, ...(m[2] ? { minLength: Number(m[2]) } : {}) }),
    )
    required = [...fromPlugins, ...fromSite]
  })

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('calls assertEnvironment before the config is built or any plugin runs', () => {
    const at = config.indexOf('assertEnvironment(\n')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(config.indexOf('buildConfig({'))
    expect(at).toBeLessThan(config.indexOf('createInngestClient('))
  })

  it("passes every env-reading plugin's own declaration, not a copy of it", () => {
    const call = /assertEnvironment\(([\s\S]*?)\n\)/.exec(config)?.[1] ?? ''
    for (const list of Object.keys(PLUGIN_LISTS)) {
      expect(call, list).toMatch(new RegExp(`^\\s+${list},$`, 'm'))
    }
    // The site's own list names only what no plugin declares.
    for (const name of ['APPROVAL_TOKEN_SECRET', 'RESEND_API_KEY', 'FORMS_IP_HASH_SECRET']) {
      expect(call, name).not.toContain(`'${name}'`)
    }
  })

  it('adds the site variables, and the database through its resolver', () => {
    const names = required.map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['PAYLOAD_SECRET', 'NEXT_PUBLIC_SERVER_URL']))
    expect(config).toContain('() => databaseConnectionString(),')
  })

  it('lists every required variable in .env.example', () => {
    const listed = new Set([...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!))
    expect(required.map((r) => r.name).filter((name) => !listed.has(name))).toEqual([])
    expect(listed.has('DATABASE_URI')).toBe(true)
  })

  it('gives CI a placeholder for every required variable, long enough to pass', () => {
    for (const { name, minLength } of required) {
      const value = new RegExp(`^  ${name}: (\\S+)`, 'm').exec(workflow)?.[1]
      expect(value, name).toBeDefined()
      expect(value!.length, name).toBeGreaterThanOrEqual(minLength ?? 1)
    }
  })

  it("names every plugin's declared variable in the environment-variables doc's table", async () => {
    const doc = await readFile(
      join(PACKAGES_DIR, '..', 'docs', 'operations', 'environment-variables.md'),
      'utf-8',
    )
    const table = doc.slice(doc.indexOf('### What the plugins declare'))
    for (const pkg of Object.values(PLUGIN_LISTS)) {
      const source = await readFile(join(PACKAGES_DIR, pkg, 'src', 'options.ts'), 'utf-8')
      for (const { name, minLength } of declarationsIn(source)) {
        expect(table, name).toMatch(new RegExp(`\\| \`${name}\` \\| ${minLength ?? '—'} \\|`))
      }
    }
  })

  it('leaves the forms secret to the declaration rather than a non-null assertion', () => {
    expect(config).not.toContain('process.env.FORMS_IP_HASH_SECRET!')
  })
})
