import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest } from '@forumone/throughline-design-contract'
import { formatLintIssues, lintManifest } from '@forumone/throughline-design-contract/lint'

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

async function main() {
  const raw = await readJson<unknown>(manifestPath)
  const loaded = loadManifest(raw)

  const availableStoryIds = await collectStoryIds()
  const lintOptions = availableStoryIds ? { availableStoryIds } : {}

  const issues = lintManifest(loaded.raw, lintOptions)
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
