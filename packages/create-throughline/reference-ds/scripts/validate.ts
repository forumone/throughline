import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from '@forumone/throughline-design-system/contract'
import { formatLintIssues, lintManifest } from '@forumone/throughline-design-system/lint'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const manifestPath = resolve(packageRoot, 'dist/manifest.json')
const storybookIndexPath = resolve(packageRoot, 'storybook-static/index.json')

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as T
}

async function collectStoryIds(): Promise<Set<string> | undefined> {
  const exists = await stat(storybookIndexPath).catch(() => null)
  if (!exists) {
    console.warn(
      `No storybook-static/index.json found; skipping storyId lint. Run \`pnpm build-storybook\` first to enable it.`,
    )
    return undefined
  }
  const index = await readJson<{ entries: Record<string, { id: string; type: string }> }>(
    storybookIndexPath,
  )
  const ids = new Set<string>()
  for (const entry of Object.values(index.entries)) {
    if (entry.type === 'story') ids.add(entry.id)
  }
  return ids
}

/*
Lint rules this design system treats as failures, though the shared linter
reports them as warnings.

The suite's linter sets both to `warning` because it serves every project, and a
project migrating an existing design system onto the contract should not be
blocked by prose. A design system written against the contract from the start is
never mid-migration, so it starts strict. Relax a rule here, deliberately, if
yours is.

Both are promoted because of who reads them. `intent` and `antiExamples` are the
two fields the composing agent reasons about hardest: `intent` is how it chooses
between components that could both fit, and `antiExamples` is how it rules one
out. A component with neither still renders, and still gets composed into the
wrong place, silently.
*/
const REQUIRED_RULES = new Set(['antiExamples.empty', 'intent.brevity'])

async function main() {
  const raw = await readJson<unknown>(manifestPath)
  const loaded = loadManifest(raw)

  const availableStoryIds = await collectStoryIds()
  const lintOptions = availableStoryIds ? { availableStoryIds } : {}

  /*
  Severity is rewritten, not just re-bucketed: `formatLintIssues` groups by the
  field itself, so a promoted rule left as a warning would print under
  "Warnings" immediately before the command exits 1.
  */
  const issues = lintManifest(loaded.raw, lintOptions).map((issue) =>
    REQUIRED_RULES.has(issue.rule) ? { ...issue, severity: 'error' as const } : issue,
  )
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  if (errors.length > 0) {
    console.error(formatLintIssues(errors))
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.warn(formatLintIssues(warnings))
  } else {
    console.log(`Manifest is clean (${loaded.listComponents().length} components).`)
  }
}

await main()
