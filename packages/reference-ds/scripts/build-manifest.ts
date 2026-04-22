import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  CONTRACT_VERSION,
  ManifestSchema,
  type ComponentContract,
} from '@forumone/throughline-design-contract'
import { getTokenList } from '../src/tokens/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const componentsDir = resolve(packageRoot, 'src/components')
const outputDir = resolve(packageRoot, 'dist')
const outputFile = resolve(outputDir, 'manifest.json')

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(resolve(packageRoot, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw) as { version?: string }
  return parsed.version ?? '0.0.0'
}

async function collectContracts(): Promise<Record<string, ComponentContract>> {
  const components: Record<string, ComponentContract> = {}

  let entries: string[]
  try {
    entries = await readdir(componentsDir)
  } catch {
    return components
  }

  for (const name of entries) {
    const dir = resolve(componentsDir, name)
    const dirStat = await stat(dir).catch(() => null)
    if (!dirStat?.isDirectory()) continue

    const contractPath = join(dir, `${name}.contract.ts`)
    const contractStat = await stat(contractPath).catch(() => null)
    if (!contractStat?.isFile()) continue

    const module = (await import(pathToFileURL(contractPath).href)) as {
      contract?: ComponentContract
    }
    if (!module.contract) {
      throw new Error(`${name}.contract.ts does not export "contract"`)
    }
    components[name] = module.contract
  }

  return components
}

async function main() {
  const components = await collectContracts()

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    designSystem: {
      name: '@forumone/throughline-reference-ds',
      version: await readPackageVersion(),
      description:
        'A brand-neutral reference design system demonstrating contract compliance for Throughline.',
    },
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
