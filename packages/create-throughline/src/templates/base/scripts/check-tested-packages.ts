import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/*
Every workspace package that ships code has at least one test.

    pnpm check:tested

Deliberately not a coverage percentage. A number invites a target, and a target
invites tests written to move it. What this asserts is the one bit a coverage
report hides: a package with source and **no test file at all**, which looks
exactly like a package whose tests pass. Defects in a code generator, a
serialiser or a set of access rules then surface downstream, one at a time, long
after the package that caused them.
*/

/**
 * Packages with source files and no tests, keyed by their path from the repo
 * root, with the reason.
 *
 * This is the whole exception list. An entry is a claim that the package holds
 * no behaviour worth asserting, not that testing it is inconvenient. An entry
 * whose package has since gained a test fails the check, so each one is removed
 * by the same change that makes it untrue.
 */
const ACCEPTED: Record<string, string> = {
{{#if useReferenceDs}}{{else}}  'design-system':
    'Placeholder until the design system is written. Delete this entry with its first component.',
{{/if}}}

/** Directories that never hold source worth testing. */
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'storybook-static',
  'coverage',
  '__snapshots__',
])

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

const isTest = (name: string): boolean => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)

const isSource = (name: string): boolean =>
  SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension)) &&
  !isTest(name) &&
  !name.endsWith('.d.ts')

interface Counts {
  source: number
  tests: number
}

/**
 * Source and test files under a package's own `src`. `src` rather than the
 * package root, so a package cannot pass on the strength of its own build
 * tooling. A package with no `src` ships no code and is not asked.
 */
function countUnder(packagePath: string): Counts | undefined {
  const src = join(packagePath, 'src')
  if (!existsSync(src)) return undefined

  const counts: Counts = { source: 0, tests: 0 }
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (isTest(entry.name)) counts.tests += 1
      else if (isSource(entry.name)) counts.source += 1
    }
  }
  walk(src)
  return counts
}

interface WorkspacePackage {
  name: string
  path: string
}

function workspacePackages(): WorkspacePackage[] {
  const stdout = execFileSync('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  })
  return (JSON.parse(stdout) as WorkspacePackage[]).filter((pkg) => Boolean(pkg.name && pkg.path))
}

function main(): void {
  const root = process.cwd()
  const untested: string[] = []
  const staleExceptions: string[] = []
  let checked = 0

  for (const pkg of workspacePackages()) {
    const counts = countUnder(pkg.path)
    if (!counts || counts.source === 0) continue

    checked += 1
    const where = relative(root, pkg.path) || '.'
    const accepted = ACCEPTED[where]

    if (counts.tests > 0) {
      // An exception that has stopped applying reads, in review, as though
      // somebody decided this package needs no tests.
      if (accepted) staleExceptions.push(where)
      console.log(
        `  = ${where.padEnd(32)} ${String(counts.tests).padStart(3)} test files  ` +
          `${String(counts.source).padStart(4)} source`,
      )
      continue
    }

    if (accepted) {
      console.log(`  - ${where.padEnd(32)} no tests, accepted`)
      continue
    }

    untested.push(where)
    console.log(`  ! ${where.padEnd(32)}   0 test files  ${String(counts.source).padStart(4)} source`)
  }

  if (staleExceptions.length > 0) {
    console.log(
      [
        '',
        `${staleExceptions.length} package(s) are on the accepted list and now have tests:`,
        '',
        ...staleExceptions.map((where) => `      ${where}`),
        '',
        'Delete the entry from ACCEPTED in scripts/check-tested-packages.ts.',
      ].join('\n'),
    )
    process.exitCode = 1
  }

  if (untested.length === 0) {
    if (!process.exitCode) console.log(`\nAll ${checked} packages that ship code have tests.`)
    return
  }

  console.log(
    [
      '',
      `${untested.length} package(s) ship code with no test file:`,
      '',
      ...untested.map((where) => `      ${where}`),
      '',
      'One test is the bar, not a coverage number. If the package genuinely holds no',
      'runtime behaviour, add it to ACCEPTED in scripts/check-tested-packages.ts with',
      'the reason.',
    ].join('\n'),
  )
  process.exitCode = 1
}

main()
