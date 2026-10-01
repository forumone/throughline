#!/usr/bin/env node
/*
Does each design-system contract produce the props its component takes?

  check-block-props <manifest.json> <components-dir>... [--overrides <module>]

This package ships TypeScript source, and the args files and overrides it loads
are TypeScript too, so `tsx` is registered before anything is imported.
*/
import { register } from 'tsx/esm/api'

register()
const { main } = await import('../src/testing/checkBlockPropsCli.ts')
process.exitCode = await main(process.argv.slice(2))
