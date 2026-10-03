import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const SCOPE_PREFIX = '@forumone/throughline-'
/** The one package whose name has no suffix: `version_throughline`. */
const BARE_NAME = '@forumone/throughline'

/**
 * The version of every Throughline package the scaffold depends on, keyed for
 * the template renderer: `@forumone/throughline-design-system` becomes
 * `version_design_system`, rendered as `"^{{version_design_system}}"`.
 *
 * The ranges used to be typed into the templates by hand, and nothing moved
 * them: they sat at `^0.2.0` — which for a 0.x version admits patches only —
 * while the packages reached 0.9 and 0.10. A scaffolded site installed the
 * earliest releases, against a `payload.config.ts` written for today's APIs.
 *
 * So the versions are read, never typed. A published scaffolder reads
 * `versions.json`, which `copy-templates` writes beside `templates/` at build
 * time; `publish-packages` builds after `changeset version`, so that file names
 * exactly the set being published. Running from source (tests, `tsx`), there is
 * no such file and the workspace's own `package.json` files are the answer.
 */
export async function loadPackageVersions(templatesDir: string): Promise<Record<string, string>> {
  const baked = resolve(templatesDir, '..', 'versions.json')
  if (existsSync(baked)) {
    return templateKeys(JSON.parse(await readFile(baked, 'utf-8')) as Record<string, string>)
  }
  // src/templates or dist/templates -> the package -> packages/
  return templateKeys(await readWorkspaceVersions(resolve(templatesDir, '..', '..', '..')))
}

/** `{ '@forumone/throughline': '1.0.0', … }` from a `packages/` directory. */
export async function readWorkspaceVersions(packagesDir: string): Promise<Record<string, string>> {
  const versions: Record<string, string> = {}
  const entries = await readdir(packagesDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifest = join(packagesDir, entry.name, 'package.json')
    if (!existsSync(manifest)) continue
    const {
      name,
      version,
      private: isPrivate,
    } = JSON.parse(await readFile(manifest, 'utf-8')) as {
      name?: string
      version?: string
      private?: boolean
    }
    if (!name || !isThroughline(name) || !version || isPrivate) continue
    versions[name] = version
  }
  if (Object.keys(versions).length === 0) {
    throw new Error(
      `create-throughline: no package versions found. Expected versions.json beside the ` +
        `templates, or @forumone/throughline packages in ${packagesDir}.`,
    )
  }
  return versions
}

function isThroughline(name: string): boolean {
  return name === BARE_NAME || name.startsWith(SCOPE_PREFIX)
}

function templateKeys(versions: Record<string, string>): Record<string, string> {
  const keys: Record<string, string> = {}
  for (const [name, version] of Object.entries(versions)) {
    if (name === BARE_NAME) keys['version_throughline'] = version
    else if (name.startsWith(SCOPE_PREFIX))
      keys[`version_${name.slice(SCOPE_PREFIX.length).replace(/-/g, '_')}`] = version
  }
  return keys
}
