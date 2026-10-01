#!/usr/bin/env node
/*
Does each design-system contract produce the props its component takes?

  check-block-props <manifest.json> <components-dir>... [--overrides <module>] [--tsconfig <file>]

This package ships TypeScript source, and the args files and overrides it loads
are TypeScript too, so `tsx` is registered before anything is imported.

Both of tsx's hooks, not just the ESM one. A `.ts` file with no
`"type": "module"` above it is CommonJS to Node, and before Node 22 the ESM
hook hands such a file to Node's own CommonJS loader, which cannot read
TypeScript. A design system's directory need not be an ES module package.

`--tsconfig` is read here rather than by the CLI, because it has to be known
before tsx is registered. An args file written in TSX compiles with whatever
`jsx` the tsconfig tsx finds says, and tsx looks beside the working directory:
for a site running this from its app, that is the app's tsconfig, not the
design system's. A design system that keeps its `jsx` in a project reference
(`tsconfig.app.json`) has to be named. #207.

Stylesheets are stubbed (`./stub-styles.mjs`): a component imports its CSS, an
args file imports its component, and Node cannot load a `.css` file.
*/
import { createRequire, register as registerHooks } from 'node:module'
import path from 'node:path'
import { register as registerCommonJs } from 'tsx/cjs/api'
import { register } from 'tsx/esm/api'

const argv = process.argv.slice(2)
const flag = argv.indexOf('--tsconfig')
const tsconfig = flag === -1 ? undefined : argv[flag + 1]
if (tsconfig) process.env.TSX_TSCONFIG_PATH = path.resolve(tsconfig)

registerCommonJs()
register(tsconfig ? { tsconfig: path.resolve(tsconfig) } : {})
// After tsx, so it runs first: hooks registered later are consulted earlier.
registerHooks('./stub-styles.mjs', import.meta.url)

// The CommonJS half of the same stub, for a design system that is not an ES
// module package. A `require`d stylesheet becomes the same answer-any-name
// object.
const extensions = createRequire(import.meta.url).extensions
for (const ext of ['.css', '.scss', '.sass', '.less']) {
  extensions[ext] = (module) => {
    module.exports = new Proxy({}, { get: (_, key) => (typeof key === 'string' ? key : undefined) })
  }
}

const { main } = await import('../src/testing/checkBlockPropsCli.ts')
process.exitCode = await main(argv)
