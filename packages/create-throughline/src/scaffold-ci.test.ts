import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
import type { Answers } from './prompts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')

for (const useReferenceDs of [true, false]) {
  describe(`scaffolded CI (${useReferenceDs ? 'with' : 'without'} reference DS)`, () => {
    let workDir: string
    let target: string
    let workflow: string
    let rootScripts: Record<string, string>
    let webScripts: Record<string, string>

    beforeAll(async () => {
      workDir = await mkdtemp(join(tmpdir(), 'create-throughline-ci-'))
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
      workflow = await readFile(join(target, '.github/workflows/ci.yml'), 'utf-8')
      rootScripts = (
        JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
          scripts: Record<string, string>
        }
      ).scripts
      webScripts = (
        JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as {
          scripts: Record<string, string>
        }
      ).scripts
    })

    afterAll(async () => {
      await rm(workDir, { recursive: true, force: true })
    })

    it('writes .github with its dot restored', () => {
      expect(existsSync(join(target, '.github/workflows/ci.yml'))).toBe(true)
      expect(existsSync(join(target, '.github/scripts/check-generated.sh'))).toBe(true)
      expect(existsSync(join(target, 'github'))).toBe(false)
    })

    it("leaves GitHub's own expressions alone", () => {
      // The renderer only matches `{{word}}`; Actions expressions keep spaces.
      expect(workflow).toContain('group: ci-${{ github.ref }}')
      expect(workflow).toContain("if: github.event_name != 'pull_request'")
      expect(workflow).not.toMatch(/\{\{#if|\{\{\/if|\{\{else\}\}/)
    })

    it('runs only root scripts that exist', () => {
      const referenced = [...workflow.matchAll(/run: pnpm ([a-z][\w:-]*)/g)].map((m) => m[1]!)
      const builtins = new Set(['install'])
      const missing = referenced.filter((name) => !builtins.has(name) && !rootScripts[name])
      expect(referenced.length).toBeGreaterThan(5)
      expect(missing).toEqual([])
    })

    it('runs only apps/web scripts that exist', async () => {
      const script = await readFile(join(target, '.github/scripts/check-generated.sh'), 'utf-8')
      const referenced = [
        ...`${workflow}\n${script}`.matchAll(/pnpm --dir apps\/web (?:run )?([a-z][\w:-]*)/g),
      ].map((m) => m[1]!)
      expect(referenced).toEqual(
        expect.arrayContaining(['migrate', 'generate:types', 'generate:importmap']),
      )
      expect(referenced.filter((name) => !webScripts[name])).toEqual([])
    })

    it('ships a check-generated.sh that bash can parse', () => {
      const result = spawnSync('bash', ['-n', join(target, '.github/scripts/check-generated.sh')], {
        encoding: 'utf-8',
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    })

    it('gives the config every variable it validates, as placeholders', () => {
      for (const name of [
        'DATABASE_URI',
        'PAYLOAD_SECRET',
        'APPROVAL_TOKEN_SECRET',
        'FORMS_IP_HASH_SECRET',
        'RESEND_API_KEY',
        'EMAIL_FROM_ADDRESS',
        'NEXT_PUBLIC_SERVER_URL',
      ]) {
        expect(workflow, name).toMatch(new RegExp(`^  ${name}: \\S+`, 'm'))
      }
      // The plugins that sign things refuse a secret under 32 characters.
      for (const name of ['PAYLOAD_SECRET', 'APPROVAL_TOKEN_SECRET', 'FORMS_IP_HASH_SECRET']) {
        const value = new RegExp(`^  ${name}: (\\S+)`, 'm').exec(workflow)?.[1] ?? ''
        expect(value.length, name).toBeGreaterThanOrEqual(32)
      }
    })
  })
}
