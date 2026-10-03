#!/usr/bin/env node
// The Payload CLI, run in its own process group under a wall clock, with a
// sweep for runs a killed shell left behind. See ./payload-cli.mjs.
import { main } from './payload-cli.mjs'

await main()
