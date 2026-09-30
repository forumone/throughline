import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generate } from './generator.js'
import type { Answers } from './prompts.js'

/*
Every name the scaffold imports from a Throughline package is exported by that
package, here, in this workspace.

The template is not compiled by anything in this repository, so an export that
was renamed or removed leaves it importing a name that no longer exists — and
nothing notices until somebody scaffolds a project and runs `tsc`. That is how
the template came to import `createApiKeysCollection` for months after core
removed it. This reads the exports statically, following `export … from` and
`export *` through each package's `src`, so it needs no build.
*/

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, 'templates')
const PACKAGES_DIR = resolve(__dirname, '..', '..')

function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

async function exportsOf(file: string, seen = new Set<string>()): Promise<Set<string>> {
  const names = new Set<string>()
  if (seen.has(file)) return names
  seen.add(file)

  const source = ts.createSourceFile(file, await readFile(file, 'utf-8'), ts.ScriptTarget.Latest)
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const from =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined
      if (!statement.exportClause) {
        // `export * from './x.js'`
        const target = from?.startsWith('.') ? resolveRelative(file, from) : undefined
        if (target) for (const name of await exportsOf(target, seen)) names.add(name)
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text)
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        names.add(statement.exportClause.name.text)
      }
      continue
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text)
    }
  }
  return names
}

/** `import { a, type B, c as d } from '@forumone/throughline-x'` -> ['x', ['a', 'B', 'c']] */
function throughlineImports(file: string, text: string): Array<[string, string[]]> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: Array<[string, string[]]> = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const match = /^@forumone\/throughline-([a-z-]+)$/.exec(statement.moduleSpecifier.text)
    const bindings = statement.importClause?.namedBindings
    if (!match || !bindings || !ts.isNamedImports(bindings)) continue
    found.push([
      match[1]!,
      bindings.elements.map((element) => (element.propertyName ?? element.name).text),
    ])
  }
  return found
}

for (const useReferenceDs of [true, false]) {
  describe(`scaffold imports (${useReferenceDs ? 'with' : 'without'} reference DS)`, () => {
    let workDir: string
    let target: string

    beforeAll(async () => {
      workDir = await mkdtemp(join(tmpdir(), 'create-throughline-imports-'))
      target = join(workDir, 'demo')
      const answers: Answers = {
        targetDir: target,
        projectName: 'demo',
        packageScope: 'acme',
        useReferenceDs,
        initializeGit: false,
        installDeps: false,
        deploymentPlatform: 'vercel',
        databasePlatform: 'neon',
      }
      await generate(answers, { templatesDir: TEMPLATES_DIR, skipSideEffects: true })
    })

    afterAll(async () => {
      await rm(workDir, { recursive: true, force: true })
    })

    it('imports only names each Throughline package exports', async () => {
      const files = ['apps/web/src/payload.config.ts', 'apps/web/src/app/api/inngest/route.ts']
      const missing: string[] = []
      let checked = 0

      for (const file of files) {
        const text = await readFile(join(target, file), 'utf-8')
        for (const [pkg, names] of throughlineImports(file, text)) {
          const entry = join(PACKAGES_DIR, pkg, 'src', 'index.ts')
          expect(existsSync(entry), `${file} imports @forumone/throughline-${pkg}`).toBe(true)
          const exported = await exportsOf(entry)
          for (const name of names) {
            checked += 1
            if (!exported.has(name))
              missing.push(`${file}: ${name} from @forumone/throughline-${pkg}`)
          }
        }
      }

      expect(checked).toBeGreaterThan(15)
      expect(missing).toEqual([])
    })
  })
}

describe('the scaffold serves Throughline tools over MCP', () => {
  let workDir: string
  let config: string
  let web: { dependencies: Record<string, string> }

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'create-throughline-mcp-'))
    const target = join(workDir, 'demo')
    await generate(
      {
        targetDir: target,
        projectName: 'demo',
        packageScope: 'acme',
        useReferenceDs: true,
        initializeGit: false,
        installDeps: false,
        deploymentPlatform: 'vercel',
        databasePlatform: 'neon',
      },
      { templatesDir: TEMPLATES_DIR, skipSideEffects: true },
    )
    config = await readFile(join(target, 'apps/web/src/payload.config.ts'), 'utf-8')
    web = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf-8')) as typeof web
  })

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('hands one collector to every tool-bearing plugin, and registers mcpPlugin after them', () => {
    expect(config).toContain('const mcpTools = createMcpToolCollector()')
    const plugins = [
      'componentsPlugin',
      'publishingPlugin',
      'approvalsPlugin',
      'auditQueryPlugin',
      'formsPlugin',
      'integrationsPlugin',
    ]
    const mcp = config.indexOf('mcpPlugin({')
    expect(mcp).toBeGreaterThan(-1)
    for (const plugin of plugins) {
      const start = config.indexOf(`${plugin}(`)
      expect(start, plugin).toBeGreaterThan(-1)
      expect(start, `${plugin} is registered before mcpPlugin`).toBeLessThan(mcp)
      // Its call runs until the next plugin call, or mcpPlugin.
      const next = [...plugins.map((p) => config.indexOf(`${p}(`)), mcp]
        .filter((at) => at > start)
        .sort((a, b) => a - b)[0]
      expect(config.slice(start, next), plugin).toContain('mcpTools')
    }
    expect(config).toContain('mcp: { tools: mcpTools.tools }')
  })

  it('makes the MCP key collection admin-only', () => {
    const start = config.indexOf('overrideApiKeyCollection')
    expect(start).toBeGreaterThan(-1)
    const override = config.slice(start, config.indexOf('}),', start))
    for (const operation of ['read', 'create', 'update', 'delete']) {
      expect(override, operation).toContain(`${operation}: isAdmin`)
    }
  })

  it('depends on @payloadcms/plugin-mcp, and on no removed core export', () => {
    expect(web.dependencies['@payloadcms/plugin-mcp']).toBeDefined()
    expect(config).not.toContain('createApiKeysCollection')
  })
})
