import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  CONTRACT_VERSION,
  ManifestSchema,
  type ComponentContract,
} from '@forumone/throughline-design-system/contract'
import { getTokenList } from '../src/tokens/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const outputDir = resolve(packageRoot, 'dist')
const outputFile = resolve(outputDir, 'manifest.json')

/**
 * Every directory, relative to the package, whose subdirectories are
 * components. A design system that splits components across layers (atoms and
 * molecules, or a Gesso-style `02-layouts` / `03-components`) lists each one.
 */
const CONTRACT_LAYERS = ['src/components']

/**
 * The manifest names the design system from its own `package.json`. This file
 * is vendored into every scaffolded project, and a hard-coded name made each of
 * them publish a manifest claiming to be the reference design system.
 */
async function readPackage(): Promise<{ name: string; version: string; description?: string }> {
  const raw = await readFile(resolve(packageRoot, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw) as { name?: string; version?: string; description?: string }
  if (!parsed.name) throw new Error('package.json has no "name"; the manifest needs one.')
  return {
    name: parsed.name,
    version: parsed.version ?? '0.0.0',
    ...(parsed.description ? { description: parsed.description } : {}),
  }
}

async function collectContracts(): Promise<Record<string, ComponentContract>> {
  const components: Record<string, ComponentContract> = {}

  for (const layer of CONTRACT_LAYERS) {
    let entries: string[]
    try {
      entries = await readdir(resolve(packageRoot, layer))
    } catch {
      continue
    }

    for (const name of entries.sort()) {
      // Underscore-prefixed directories are private implementation details.
      if (name.startsWith('_') || name.startsWith('.')) continue

      const dir = resolve(packageRoot, layer, name)
      const dirStat = await stat(dir).catch(() => null)
      if (!dirStat?.isDirectory()) continue

      /*
      A component with no contract is refused, not skipped. Skipped, it is
      absent from the manifest — and every other gate reads the manifest or the
      contract, so nothing would notice that the CMS cannot offer it.
      */
      const contractPath = join(dir, `${name}.contract.ts`)
      const contractStat = await stat(contractPath).catch(() => null)
      if (!contractStat?.isFile()) {
        throw new Error(
          `${layer}/${name} has no ${name}.contract.ts, so the CMS cannot offer it. ` +
            `Write one beside the component. If the directory is not a component, ` +
            `prefix it with an underscore.`,
        )
      }

      const module = (await import(pathToFileURL(contractPath).href)) as {
        contract?: ComponentContract
      }
      if (!module.contract) {
        throw new Error(`${name}.contract.ts does not export "contract"`)
      }
      if (components[name]) {
        throw new Error(`Duplicate component contract for "${name}"`)
      }
      components[name] = module.contract
    }
  }

  return components
}

async function main() {
  const components = await collectContracts()

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    designSystem: await readPackage(),
    tokens: getTokenList(),
    components,
    build: {
      timestamp: new Date().toISOString(),
      source: 'scripts/build-manifest.ts',
    },
  }

  const result = ManifestSchema.safeParse(manifest)
  if (!result.success) {
    console.error('Generated manifest failed validation:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    process.exit(1)
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputFile, JSON.stringify(result.data, null, 2), 'utf8')

  const componentCount = Object.keys(components).length
  console.log(`Wrote ${outputFile} (${componentCount} components)`)
}

await main()
