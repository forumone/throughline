/* eslint-disable no-console -- a command-line tool, whose output is the console */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { COUNTERPARTS, rewriteSource, type Finding } from './rewrite.js'

/*
`throughline migrate-imports [paths…] [--dry-run]`

Rewrites every 0.x Throughline import under the given paths (default: the
working directory) to its 1.0 home, and reports what it could not place. Exits 1
when anything is left unresolved, so a migration can gate on it.
*/

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const SKIP = new Set(['node_modules', 'dist', '.next', '.turbo', 'build', 'coverage', '.git'])
const OLD_PACKAGES = [
  ...new Set(Object.keys(COUNTERPARTS).map((s) => s.split('/').slice(0, 2).join('/'))),
]

const USAGE = `Usage: throughline migrate-imports [paths…] [--dry-run]

Rewrites imports of the 0.x @forumone/throughline-* packages to
@forumone/throughline and @forumone/throughline-design-system 1.0.

  --dry-run   report what would change, and write nothing`

interface Write {
  stdout: (line: string) => void
  stderr: (line: string) => void
}

async function* walk(path: string): AsyncGenerator<string> {
  const info = await stat(path)
  if (info.isFile()) {
    yield path
    return
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(path, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

export async function migrateImports(
  args: readonly string[],
  out: Write = { stdout: console.log, stderr: console.error },
): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    out.stdout(USAGE)
    return 0
  }
  const dryRun = args.includes('--dry-run')
  const roots = args.filter((a) => !a.startsWith('--'))
  const cwd = process.cwd()
  let changed = 0
  const review: Array<Finding & { file: string }> = []
  const unresolved: Array<Finding & { file: string }> = []
  const manifests: Array<{ file: string; deps: string[] }> = []

  for (const root of roots.length > 0 ? roots : ['.']) {
    for await (const file of walk(resolve(root))) {
      const name = relative(cwd, file) || file
      if (file.endsWith('package.json')) {
        const manifest = JSON.parse(await readFile(file, 'utf8')) as Record<
          string,
          Record<string, string> | undefined
        >
        const deps = ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) =>
          Object.keys(manifest[field] ?? {}).filter((dep) => OLD_PACKAGES.includes(dep)),
        )
        if (deps.length > 0) manifests.push({ file: name, deps })
        continue
      }
      if (!SOURCE.test(file)) continue
      const text = await readFile(file, 'utf8')
      if (!text.includes('@forumone/throughline-')) continue
      const result = rewriteSource(text)
      for (const finding of result.review) review.push({ file: name, ...finding })
      for (const finding of result.unresolved) unresolved.push({ file: name, ...finding })
      if (result.changed) {
        changed++
        if (!dryRun) await writeFile(file, result.text)
      }
    }
  }

  out.stdout(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${changed} file${changed === 1 ? '' : 's'}.`)
  if (review.length > 0) {
    out.stdout(`\nRewritten, but check (${review.length}):`)
    for (const f of review) out.stdout(`  ${f.file}:${f.line}  ${f.message}`)
  }
  if (manifests.length > 0) {
    out.stdout(
      '\nDependencies to replace with @forumone/throughline (and @forumone/throughline-design-system for design-contract and design-system-payload):',
    )
    for (const m of manifests) out.stdout(`  ${m.file}: ${m.deps.join(', ')}`)
  }
  if (unresolved.length > 0) {
    out.stderr(`\nLeft as they were (${unresolved.length}):`)
    for (const f of unresolved) out.stderr(`  ${f.file}:${f.line}  ${f.message}`)
    return 1
  }
  return 0
}

/** The `throughline` bin: one subcommand so far. */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'migrate-imports') return migrateImports(rest)
  console.error(command ? `Unknown command: ${command}\n\n${USAGE}` : USAGE)
  return command ? 2 : 0
}
