#!/usr/bin/env node
/*
Does each design-system contract produce the props its component takes?

  check-block-props <manifest.json> <components-dir>... [--overrides <module>]

This package ships TypeScript source, and the args files and overrides it loads
are TypeScript too, so `tsx` is registered before anything is imported.

Both of tsx's hooks, not just the ESM one. A `.ts` file with no
`"type": "module"` above it is CommonJS to Node, and before Node 22 the ESM
hook hands such a file to Node's own CommonJS loader, which cannot read
TypeScript. A design system's directory need not be an ES module package.
*/
import { register as registerCommonJs } from 'tsx/cjs/api'
import { register } from 'tsx/esm/api'

registerCommonJs()
register()
const { main } = await import('../src/testing/checkBlockPropsCli.ts')
process.exitCode = await main(process.argv.slice(2))
