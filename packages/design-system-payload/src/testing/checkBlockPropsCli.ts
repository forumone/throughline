/* eslint-disable no-console -- a command-line tool: the console is its output. */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Overrides } from '../overrides'
import {
  argsFileLoader,
  checkBlockProps,
  formatBlockPropsResult,
  type PropsManifest,
} from './checkBlockProps'

const USAGE = `Usage: check-block-props <manifest.json> <components-dir> [<components-dir>...] [--overrides <module>]

  manifest.json    the design system's built manifest
  components-dir   a directory holding one directory per component, each with a
                   <Name>Args.ts default-exporting props that satisfy <Name>Props.
                   Give several for a design system split across layers.
  --overrides      a module exporting the site's Overrides, as \`overrides\` or
                   default — the same object the generator and renderer use.`

export interface CliArgs {
  manifest: string
  componentDirs: string[]
  overrides?: string
}

/** Parse argv, or return the reason it cannot be. */
export function parseArgs(argv: readonly string[]): CliArgs | string {
  const positional: string[] = []
  let overrides: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === '--help' || arg === '-h') return USAGE
    if (arg === '--overrides') {
      overrides = argv[index + 1]
      if (!overrides) return `--overrides needs a module path.\n\n${USAGE}`
      index += 1
      continue
    }
    if (arg.startsWith('--')) return `Unknown option ${arg}.\n\n${USAGE}`
    positional.push(arg)
  }
  const [manifest, ...componentDirs] = positional
  if (!manifest || componentDirs.length === 0) return USAGE
  return { manifest, componentDirs, ...(overrides ? { overrides } : {}) }
}

async function loadOverrides(file: string): Promise<Overrides> {
  const loaded = (await import(pathToFileURL(path.resolve(file)).href)) as {
    overrides?: Overrides
    default?: Overrides
  }
  const overrides = loaded.overrides ?? loaded.default
  if (!overrides || typeof overrides !== 'object') {
    throw new Error(`${file} exports no \`overrides\` (named or default).`)
  }
  return overrides
}

/** Run the check; resolves to the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv)
  if (typeof args === 'string') {
    console.error(args)
    return 2
  }

  const manifest = JSON.parse(await readFile(path.resolve(args.manifest), 'utf8')) as PropsManifest
  if (!manifest.components || typeof manifest.components !== 'object') {
    console.error(`${args.manifest} has no "components"; is it a design-system manifest?`)
    return 2
  }

  const result = await checkBlockProps({
    manifest,
    loadArgs: argsFileLoader(args.componentDirs.map(dir => path.resolve(dir))),
    overrides: args.overrides ? await loadOverrides(args.overrides) : {},
  })
  const report = formatBlockPropsResult(result)
  if (report.ok) console.warn(report.text)
  else console.error(report.text)
  return report.ok ? 0 : 1
}
