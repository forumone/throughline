#!/usr/bin/env node
/*
The table `throughline migrate-imports` rewrites by: for each 1.0 package, every
public name and the one subpath that exports it, read by the TypeScript checker
from the packages' own entry points.

  node scripts/migrate-table.mjs     # writes src/migrate/exports.json

Committed rather than built, so the codemod needs no TypeScript at run time, and
checked by src/migrate/rewrite.test.ts, which recomputes it and fails on drift.
*/
/* eslint-disable no-console -- a script, whose output is the console */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))
const packagesDir = resolve(here, '..', '..')

/** The 1.0 packages, and where each one's source lives. */
const PACKAGES = {
  '@forumone/throughline': join(packagesDir, 'throughline'),
  '@forumone/throughline-design-system': join(packagesDir, 'design-system'),
}

function entries(dir, name) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  return Object.entries(manifest.exports).map(([sub, entry]) => {
    const base = join(dir, entry.default.replace('./dist/', 'src/').replace(/\.js$/, ''))
    const file = existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`
    return { specifier: sub === '.' ? name : `${name}/${sub.slice(2)}`, file }
  })
}

export function computeTable() {
  const table = {}
  for (const [name, dir] of Object.entries(PACKAGES)) {
    const list = entries(dir, name)
    const program = ts.createProgram(
      list.map((entry) => entry.file),
      {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        skipLibCheck: true,
        noEmit: true,
        resolveJsonModule: true,
      },
    )
    const checker = program.getTypeChecker()
    const names = {}
    for (const { specifier, file } of list) {
      const module = checker.getSymbolAtLocation(program.getSourceFile(file))
      for (const symbol of checker.getExportsOfModule(module)) {
        ;(names[symbol.name] ??= []).push(specifier)
      }
    }
    // Sorted, so the committed file diffs only when a name moves.
    table[name] = Object.fromEntries(
      Object.keys(names)
        .sort()
        .map((key) => [key, names[key].sort()]),
    )
  }
  return table
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = resolve(here, '..', 'src', 'migrate', 'exports.json')
  writeFileSync(target, JSON.stringify(computeTable(), null, 2) + '\n')
  console.log(`Wrote ${target}`)
}
