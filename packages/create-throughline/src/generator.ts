import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderTemplate } from './utils/templates.js'
import type { Answers } from './prompts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_TEMPLATES_DIR = resolve(__dirname, 'templates')

export interface GenerateOptions {
  /** Override the templates directory (used by tests). */
  templatesDir?: string
  /** Skip side effects: `git init` + `pnpm install`. Used by tests. */
  skipSideEffects?: boolean
  /** Optional progress callback for spinners. */
  onProgress?: (step: string) => void
}

/**
 * Generates a new Throughline monorepo at `answers.targetDir`. Always:
 * - copies `templates/base` into the target dir, with `{{var}}` templating
 *   applied to every text file (skipping common binary suffixes)
 * - either renders the `with-reference-ds` overlay or the `without-reference-ds`
 *   overlay onto the result, based on `answers.useReferenceDs`
 *
 * Side-effect steps (`git init`, `pnpm install`) are gated behind
 * `options.skipSideEffects` so tests can run the generator in a temp dir
 * without spawning subprocesses.
 */
export async function generate(answers: Answers, options: GenerateOptions = {}): Promise<void> {
  const templatesDir = options.templatesDir ?? DEFAULT_TEMPLATES_DIR
  const onProgress = options.onProgress ?? (() => {})

  onProgress('Creating project structure')
  await mkdir(answers.targetDir, { recursive: true })
  await renderDirectory({
    source: join(templatesDir, 'base'),
    target: answers.targetDir,
    data: answers as unknown as Record<string, unknown>,
  })

  onProgress(answers.useReferenceDs ? 'Wiring reference design system' : 'Preparing design system placeholder')
  const overlay = answers.useReferenceDs ? 'with-reference-ds' : 'without-reference-ds'
  await renderDirectory({
    source: join(templatesDir, overlay),
    target: answers.targetDir,
    data: answers as unknown as Record<string, unknown>,
  })

  if (answers.initializeGit && !options.skipSideEffects) {
    onProgress('Initializing git')
    await initGit(answers.targetDir)
  }

  if (answers.installDeps && !options.skipSideEffects) {
    onProgress('Installing dependencies (this may take a minute)')
    await installDependencies(answers.targetDir)
  }
}

interface RenderArgs {
  source: string
  target: string
  data: Record<string, unknown>
}

/**
 * Recursively copies `source` into `target`, applying `renderTemplate` to
 * the contents of every text file and to filenames containing `{{var}}`
 * markers. Files with `.template` suffix have the suffix stripped after
 * rendering so we can author templates with realistic names without
 * triggering tooling (e.g. `package.json.template`).
 *
 * Binary files (matched by extension) are copied byte-for-byte. Empty
 * directories are preserved so the scaffold can ship placeholder dirs.
 */
async function renderDirectory({ source, target, data }: RenderArgs): Promise<void> {
  let entries
  try {
    entries = await readdir(source, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  await mkdir(target, { recursive: true })

  for (const entry of entries) {
    const renderedName = renderTemplate(entry.name, data)
    const sourcePath = join(source, entry.name)
    const targetPath = join(target, renderedName)

    if (entry.isDirectory()) {
      await renderDirectory({ source: sourcePath, target: targetPath, data })
      continue
    }

    if (!entry.isFile()) continue

    if (isBinary(entry.name)) {
      await cp(sourcePath, targetPath)
      continue
    }

    const raw = await readFile(sourcePath, 'utf-8')
    const rendered = renderTemplate(raw, data)
    const finalPath = targetPath.endsWith('.template')
      ? targetPath.slice(0, -'.template'.length)
      : targetPath
    await writeFile(finalPath, rendered)
  }
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.pdf',
  '.zip',
])

function isBinary(filename: string): boolean {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return false
  return BINARY_EXTENSIONS.has(filename.slice(dot).toLowerCase())
}

async function initGit(dir: string): Promise<void> {
  await runCommand('git', ['init'], dir)
  await runCommand('git', ['add', '.'], dir)
  await runCommand(
    'git',
    ['commit', '-m', 'Initial commit from create-throughline'],
    dir,
  )
}

async function installDependencies(dir: string): Promise<void> {
  await runCommand('pnpm', ['install'], dir)
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

// Re-exports kept around so tests in adjacent packages can stub these without
// reaching into the implementation. Not part of the public API surface.
export const __testing = { renderDirectory, isBinary, rename, rm, stat }
