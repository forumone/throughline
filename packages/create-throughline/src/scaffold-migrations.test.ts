import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
import type { Answers } from './prompts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')
const TSX = resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')

function answers(targetDir: string): Answers {
  return {
    targetDir,
    projectName: 'demo',
    packageScope: 'acme',
    useReferenceDs: true,
    initializeGit: false,
    installDeps: false,
    deploymentPlatform: 'vercel',
    databasePlatform: 'neon',
  }
}

describe('scaffolded migration tooling', () => {
  let workDir: string
  let target: string

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-migrations-'))
    target = join(workDir, 'demo')
    await generate(answers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
  })

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('connects through the resolver, never pushes, and names its migration directory', async () => {
    const config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    expect(config).toContain("import { databaseConnectionString } from './lib/database'")
    expect(config).toContain('connectionString: databaseConnectionString()')
    expect(config).toContain("migrationDir: path.resolve(__dirname, 'migrations')")
    expect(config).toContain('push: false')
    expect(config).not.toContain('process.env.DATABASE_URI!')
  })

  it('wires the migration scripts, marking only `migrate` as the migrating process', async () => {
    const web = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(web.scripts['migrate']).toBe('PAYLOAD_MIGRATING=1 payload migrate')
    expect(web.scripts['migrate:create']).toBe('payload migrate:create')
    expect(web.scripts['migrate:snapshot']).toBe('tsx scripts/write-migration-snapshot.ts')
    expect(web.scripts['check:migrations']).toBe('tsx scripts/check-migrations.ts')
    for (const [name, script] of Object.entries(web.scripts)) {
      if (name !== 'migrate') expect(script, name).not.toContain('PAYLOAD_MIGRATING')
    }
    expect(web.devDependencies['tsx']).toBeDefined()

    const root = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>
    }
    expect(root.scripts['check:migrations']).toBe('pnpm --dir apps/web run check:migrations')
  })

  it('ships scripts that transpile cleanly once rendered', async () => {
    for (const file of [
      'apps/web/scripts/check-migrations.ts',
      'apps/web/scripts/write-migration-snapshot.ts',
      'apps/web/scripts/lib/target.ts',
      'apps/web/src/lib/database.ts',
    ]) {
      const source = await readFile(join(target, file), 'utf-8')
      const { diagnostics = [] } = ts.transpileModule(source, {
        reportDiagnostics: true,
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      expect(messages, file).toEqual([])
    }
  })
})

describe('check:migrations', () => {
  let workDir: string
  let migrations: string
  let script: string

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-check-migrations-'))
    const target = join(workDir, 'demo')
    await generate(answers(target), { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    script = join(target, 'apps/web/scripts/check-migrations.ts')
    migrations = join(target, 'apps/web/src/migrations')
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  function run(): { status: number | null; output: string } {
    const result = spawnSync(TSX, [script], { encoding: 'utf-8', timeout: 60_000 })
    return { status: result.status, output: `${result.stdout}${result.stderr}` }
  }

  async function migration(name: string, body = '', snapshot = true): Promise<void> {
    await mkdir(migrations, { recursive: true })
    await writeFile(
      join(migrations, `${name}.ts`),
      `export async function up({ db }) {\n${body}\n}\n\nexport async function down({ db }) {}\n`,
    )
    if (snapshot) await writeFile(join(migrations, `${name}.json`), '{}')
  }

  it('passes a fresh project with no migrations directory', () => {
    const { status, output } = run()
    expect(output).toContain('No migrations yet')
    expect(status).toBe(0)
  })

  it('passes a complete chain', async () => {
    await migration('20260101_000000_initial')
    await migration('20260102_000000_jobs')
    const { status, output } = run()
    expect(output).toContain('Checked 2 migration(s)')
    expect(output).toContain('20260102_000000_jobs')
    expect(status).toBe(0)
  })

  it('fails a migration with no snapshot, even one that is not the newest', async () => {
    await migration('20260101_000000_initial', '', false)
    await migration('20260102_000000_jobs')
    const { status, output } = run()
    expect(output).toContain('20260101_000000_initial.json   <- missing')
    expect(status).toBe(1)
  })

  it('fails a snapshot left behind by a deleted migration', async () => {
    await migration('20260101_000000_initial')
    await writeFile(join(migrations, '20260102_000000_deleted.json'), '{}')
    const { status, output } = run()
    expect(output).toContain('20260102_000000_deleted.json')
    expect(status).toBe(1)
  })

  it('fails a bare drop after a cascading drop, and only that', async () => {
    await migration(
      '20260101_000000_drop_posts',
      [
        `  await db.execute(sql\`DROP TABLE "posts" CASCADE;\`)`,
        `  await db.execute(sql\`ALTER TABLE "search_rels" DROP CONSTRAINT "search_rels_posts_fk";\`)`,
      ].join('\n'),
    )
    const { status, output } = run()
    expect(output).toContain('DROP CONSTRAINT "search_rels_posts_fk"')
    expect(status).toBe(1)
  })

  it("does not mistake a foreign key's ON DELETE cascade for a cascading drop", async () => {
    await migration(
      '20260101_000000_recreate',
      [
        `  await db.execute(sql\`ALTER TABLE "a" ADD CONSTRAINT "a_b_fk" FOREIGN KEY ("b") REFERENCES "b"("id") ON DELETE cascade;\`)`,
        `  await db.execute(sql\`DROP INDEX "a_created_at_idx";\`)`,
      ].join('\n'),
    )
    const { status } = run()
    expect(status).toBe(0)
  })
})

describe('the database resolver', () => {
  const NAMES = [
    'DATABASE_URI',
    'DATABASE_URL',
    'POSTGRES_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'MIGRATION_DATABASE_URL',
    'PAYLOAD_MIGRATING',
    'NEXT_RUNTIME',
  ]
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
    for (const name of NAMES) delete process.env[name]
  })

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  // The template file has no template syntax, so it is imported as written.
  const load = () => import('./templates/base/apps/web/src/lib/database.ts')

  const DIRECT = 'postgres://u:p@ep-x.neon.tech/neondb'
  const POOLED = 'postgres://u:p@ep-x-pooler.neon.tech/neondb'

  it('prefers DATABASE_URI over the integration, and names what it read', async () => {
    const { resolveDatabaseConnection } = await load()
    process.env['DATABASE_URL'] = POOLED
    process.env['DATABASE_URI'] = DIRECT
    expect(resolveDatabaseConnection()).toEqual({ name: 'DATABASE_URI', value: DIRECT })
  })

  it('gives the app the pooled integration string ahead of the direct one', async () => {
    const { resolveDatabaseConnection } = await load()
    process.env['DATABASE_URL'] = POOLED
    process.env['DATABASE_URL_UNPOOLED'] = DIRECT
    expect(resolveDatabaseConnection().name).toBe('DATABASE_URL')
  })

  it('gives a migration the migration credential, then direct endpoints', async () => {
    const { resolveDatabaseConnection } = await load()
    process.env['PAYLOAD_MIGRATING'] = '1'
    process.env['DATABASE_URL'] = POOLED
    process.env['DATABASE_URL_UNPOOLED'] = DIRECT
    expect(resolveDatabaseConnection().name).toBe('DATABASE_URL_UNPOOLED')
    process.env['MIGRATION_DATABASE_URL'] = DIRECT
    expect(resolveDatabaseConnection().name).toBe('MIGRATION_DATABASE_URL')
  })

  it('never hands the migration credential to a Next server bundle', async () => {
    const { resolveDatabaseConnection } = await load()
    process.env['PAYLOAD_MIGRATING'] = '1'
    process.env['NEXT_RUNTIME'] = 'nodejs'
    process.env['MIGRATION_DATABASE_URL'] = DIRECT
    process.env['DATABASE_URL'] = POOLED
    expect(resolveDatabaseConnection().name).toBe('DATABASE_URL')
  })

  it('refuses a pooled endpoint for a migration, and allows it for the app', async () => {
    const { resolveDatabaseConnection } = await load()
    process.env['DATABASE_URL'] = POOLED
    expect(resolveDatabaseConnection().name).toBe('DATABASE_URL')
    process.env['PAYLOAD_MIGRATING'] = '1'
    expect(() => resolveDatabaseConnection()).toThrow(/pooled endpoint/)
  })

  it('explains the connection-string shapes that fail as something else', async () => {
    const { resolveDatabaseConnection } = await load()
    process.env['DATABASE_URI'] = `"${DIRECT}"`
    expect(() => resolveDatabaseConnection()).toThrow(/wrapped in quotes/)
    process.env['DATABASE_URI'] = `psql '${DIRECT}'`
    expect(() => resolveDatabaseConnection()).toThrow(/starts with "psql"/)
    process.env['DATABASE_URI'] = 'postgres://u:%E2%80%A2%E2%80%A2%E2%80%A2@ep-x.neon.tech/neondb'
    expect(() => resolveDatabaseConnection()).toThrow(/row of bullets/)
  })

  it('says what to set when nothing is', async () => {
    const { resolveDatabaseConnection } = await load()
    expect(() => resolveDatabaseConnection()).toThrow(/Set DATABASE_URI/)
  })
})
