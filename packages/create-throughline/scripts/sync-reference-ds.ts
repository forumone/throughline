/**
 * Vendors the reference design system's source into the scaffolder template
 * so a freshly scaffolded project gets a real, editable Storybook authoring
 * environment (components + stories + foundations + contracts), not a
 * re-export of the compiled npm package.
 *
 * `packages/reference-ds` is the single source of truth. This script copies
 * its source trees into `src/templates/with-reference-ds/design-system/`.
 * Hand-authored, project-specific files (package.json.template, tsconfig.json,
 * README) are NOT touched — only the vendored source listed in `COPY`.
 *
 *   pnpm --filter @forumone/create-throughline sync-reference-ds          # write
 *   pnpm --filter @forumone/create-throughline sync-reference-ds --check  # CI drift check
 */
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const repoRoot = resolve(packageRoot, '..', '..')
const referenceDs = resolve(repoRoot, 'packages/reference-ds')
const dest = resolve(packageRoot, 'src/templates/with-reference-ds/design-system')

/** Source trees/files vendored verbatim from reference-ds. */
const COPY = ['src', 'scripts', '.storybook', 'vitest.config.ts', 'vitest.setup.ts'] as const

/** Generated artifacts that must never be vendored. */
const SKIP = new Set(['node_modules', 'dist', 'storybook-static'])
function shouldSkip(name: string): boolean {
  return SKIP.has(name) || name.endsWith('.tsbuildinfo')
}

async function listFiles(dir: string, base = dir, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await listFiles(full, base, acc)
    else acc.push(relative(base, full))
  }
  return acc
}

async function vendoredFiles(): Promise<string[]> {
  const files: string[] = []
  for (const entry of COPY) {
    const src = join(referenceDs, entry)
    const info = await stat(src).catch(() => null)
    if (!info) continue
    if (info.isDirectory()) {
      for (const rel of await listFiles(src)) files.push(join(entry, rel))
    } else {
      files.push(entry)
    }
  }
  return files
}

async function check(): Promise<void> {
  const drifted: string[] = []
  for (const rel of await vendoredFiles()) {
    const a = await readFile(join(referenceDs, rel), 'utf8')
    const b = await readFile(join(dest, rel), 'utf8').catch(() => null)
    if (b !== a) drifted.push(rel)
  }
  if (drifted.length > 0) {
    console.error(
      `Vendored design-system template is out of sync with packages/reference-ds:\n` +
        drifted.map((f) => `  - ${f}`).join('\n') +
        `\n\nRun \`pnpm --filter @forumone/create-throughline sync-reference-ds\` and commit the result.`,
    )
    process.exit(1)
  }
  console.log(`Vendored design-system template is in sync (${(await vendoredFiles()).length} files).`)
}

async function write(): Promise<void> {
  for (const entry of COPY) {
    const src = join(referenceDs, entry)
    if (!(await stat(src).catch(() => null))) continue
    const target = join(dest, entry)
    await rm(target, { recursive: true, force: true })
    await mkdir(dirname(target), { recursive: true })
    await cp(src, target, {
      recursive: true,
      filter: (s) => !shouldSkip(s.split('/').pop() ?? ''),
    })
  }
  console.log(`Synced reference-ds source into ${relative(repoRoot, dest)}`)
}

if (process.argv.includes('--check')) {
  await check()
} else {
  await write()
}
