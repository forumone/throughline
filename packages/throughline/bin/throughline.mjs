#!/usr/bin/env node
// `throughline migrate-imports`: 0.x imports to their 1.0 homes. See
// ../src/migrate/cli.ts.
import { main } from '../dist/migrate/cli.js'

process.exitCode = await main(process.argv.slice(2))
