import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/*
Which entry may load which optional peer.

Everything below `payload` is an optional peer: a site that sends no email does
not install `resend`, and one on Payload Jobs does not install `inngest`. That
holds only while no entry it does import loads them at module load. The root
reaches every plugin, through `throughline()`, so a static import added to the
wrong file would put React Email on every site that registers the suite.

This walks each entry's source, following relative imports and skipping
type-only ones and `import()` (which loads only when it runs), and checks the
external packages it reaches against the table. A new optional peer needs a
row; a new entry is checked against every row.
*/

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
  exports: Record<string, { default: string }>
  peerDependenciesMeta: Record<string, { optional?: boolean }>
}

/** Optional peers, and the only entries allowed to load each at module load. */
const ALLOWED: Record<string, readonly string[]> = {
  inngest: ['./jobs/inngest'],
  resend: [],
  '@react-email/components': ['./email'],
  '@react-email/render': [],
  react: ['./email', './client', './rsc'],
  next: ['./client', './rsc'],
  '@payloadcms/next': ['./rsc'],
  '@payloadcms/ui': ['./client', './rsc'],
  '@vercel/blob': ['./media'],
  '@payloadcms/plugin-cloud-storage': ['./media'],
  vitest: ['./testing'],
}

function sourceOf(dist: string): string {
  const base = join(pkg, dist.replace('./dist/', 'src/').replace(/\.js$/, ''))
  return existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`
}

function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function loadsAtRuntime(statement: ts.Statement): string | undefined {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause
    if (clause?.isTypeOnly) return undefined
    const named = clause?.namedBindings
    const onlyTypes =
      clause &&
      !clause.name &&
      named &&
      ts.isNamedImports(named) &&
      named.elements.length > 0 &&
      named.elements.every((element) => element.isTypeOnly)
    if (onlyTypes) return undefined
    return (statement.moduleSpecifier as ts.StringLiteral).text
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
    if (statement.isTypeOnly) return undefined
    const clause = statement.exportClause
    if (clause && ts.isNamedExports(clause) && clause.elements.every((e) => e.isTypeOnly)) {
      return undefined
    }
    return (statement.moduleSpecifier as ts.StringLiteral).text
  }
  return undefined
}

function externalsOf(entry: string): Set<string> {
  const seen = new Set<string>()
  const external = new Set<string>()
  const stack = [entry]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    for (const statement of source.statements) {
      const specifier = loadsAtRuntime(statement)
      if (!specifier) continue
      if (specifier.startsWith('.')) {
        const target = resolveRelative(file, specifier)
        if (target) stack.push(target)
      } else if (!specifier.startsWith('node:')) {
        const parts = specifier.split('/')
        external.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!)
      }
    }
  }
  return external
}

describe('optional peers', () => {
  it('lists every optional peer in the table', () => {
    const optional = Object.entries(manifest.peerDependenciesMeta)
      .filter(([, meta]) => meta.optional)
      .map(([name]) => name)
      .sort()
    expect(optional).toEqual(Object.keys(ALLOWED).sort())
  })

  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    it(`${subpath} loads only the optional peers it is allowed`, () => {
      const loaded = externalsOf(sourceOf(entry.default))
      const unexpected = [...loaded].filter(
        (name) => name in ALLOWED && !ALLOWED[name]!.includes(subpath),
      )
      expect(unexpected).toEqual([])
    })
  }
})
