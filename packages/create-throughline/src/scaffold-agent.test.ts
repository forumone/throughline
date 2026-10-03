import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
import type { Answers } from './prompts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')

for (const useReferenceDs of [true, false]) {
  describe(`scaffolded agent setup (${useReferenceDs ? 'with' : 'without'} reference DS)`, () => {
    let workDir: string
    let target: string
    let claudeMd: string
    let rootScripts: Record<string, string>

    beforeAll(async () => {
      workDir = await mkdtemp(join(tmpdir(), 'create-throughline-agent-'))
      target = join(workDir, 'demo')
      const answers: Answers = {
        targetDir: target,
        projectName: 'demo',
        packageScope: 'acme',
        useReferenceDs,
        initializeGit: false,
        installDeps: false,
        deploymentPlatform: 'vercel',
        databasePlatform: 'neon',
      }
      await generate(answers, { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
      claudeMd = await readFile(join(target, 'CLAUDE.md'), 'utf-8')
      rootScripts = (
        JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
          scripts: Record<string, string>
        }
      ).scripts
    })

    afterAll(async () => {
      await rm(workDir, { recursive: true, force: true })
    })

    it('writes CLAUDE.md, rendered, and .claude with its dot restored', () => {
      expect(claudeMd.startsWith('# demo\n')).toBe(true)
      expect(claudeMd).not.toMatch(/\{\{/)
      expect(existsSync(join(target, '.claude/settings.json'))).toBe(true)
      expect(existsSync(join(target, '.claude/hooks/gate.sh'))).toBe(true)
      expect(existsSync(join(target, 'claude'))).toBe(false)
    })

    it('documents a gate made only of root scripts that exist, in CI order', async () => {
      const gate = /## The gate[\s\S]*?```bash\n([\s\S]*?)```/.exec(claudeMd)?.[1] ?? ''
      const referenced = [...gate.matchAll(/pnpm ([a-z][\w:-]*)/g)].map((m) => m[1]!)
      expect(referenced.length).toBeGreaterThan(5)
      expect(referenced.filter((name) => name !== 'install' && !rootScripts[name])).toEqual([])

      // The same steps, in the same order, as CI's fast job.
      const workflow = await readFile(join(target, '.github/workflows/ci.yml'), 'utf-8')
      const fast = workflow.slice(workflow.indexOf('  fast:'), workflow.indexOf('  verify:'))
      const ciSteps = [...fast.matchAll(/run: pnpm ([a-z][\w:-]*)/g)]
        .map((m) => m[1]!)
        .filter((name) => name !== 'install' && name !== 'check:audit')
      expect(referenced.filter((name) => name !== 'install')).toEqual(ciSteps)
    })

    it('says what applies to this design system', () => {
      if (useReferenceDs) expect(claudeMd).toContain('A new component needs a contract')
      else expect(claudeMd).toContain('The design system here is a placeholder')
    })

    it('registers the Stop hook, and runs it with bash since file modes do not survive', async () => {
      const settings = JSON.parse(
        await readFile(join(target, '.claude/settings.json'), 'utf-8'),
      ) as {
        hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
      }
      const command = settings.hooks.Stop[0]!.hooks[0]!.command
      expect(command).toContain('.claude/hooks/gate.sh')
      expect(command).toContain('exec bash')
      expect(command).not.toContain('-x ')
    })

    it('ships a gate.sh that bash can parse', () => {
      const result = spawnSync('bash', ['-n', join(target, '.claude/hooks/gate.sh')], {
        encoding: 'utf-8',
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    })
  })
}

describe('the Stop hook', () => {
  let repo: string
  let hook: string

  beforeAll(async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'create-throughline-hook-'))
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
    hook = join(target, '.claude/hooks/gate.sh')
    // A bare repository standing in for a project, so the hook's `pnpm` has
    // nothing to run and its failure path is exercised without an install.
    repo = join(workDir, 'repo')
    await mkdir(join(repo, 'apps'), { recursive: true })
    spawnSync('git', ['init', '-q'], { cwd: repo })
  })

  const run = (env: Record<string, string> = {}) =>
    spawnSync('bash', [hook], { cwd: repo, encoding: 'utf-8', env: { ...process.env, ...env } })

  it('is silent when nothing under apps/ or design-system/ is pending', () => {
    const result = run()
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  // The hook starts `pnpm` and then `node`: well under a second on its own, but
  // CI runs every package's suite at once on two cores, where this took 4.2s of
  // the default 5s and then 5.2s. The time is process start-up, not the hook.
  it('reports a failure as JSON, and still exits 0', async () => {
    await writeFile(join(repo, 'apps', 'touched.ts'), 'export {}\n')
    const result = run()
    expect(result.status).toBe(0)
    const message = JSON.parse(result.stdout) as { systemMessage: string; suppressOutput: boolean }
    expect(message.systemMessage).toContain('Gate FAILED')
    expect(message.suppressOutput).toBe(true)
  }, 30_000)

  it('stays out of the way when THROUGHLINE_SKIP_GATE is set', () => {
    const result = run({ THROUGHLINE_SKIP_GATE: '1' })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })
})
