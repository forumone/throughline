// Copies src/templates -> dist/templates so the published bin can resolve
// template files relative to the compiled JS. Templates are not TS code, so
// tsc doesn't move them.
import { cp, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '..', 'src', 'templates')
const dest = resolve(here, '..', 'dist', 'templates')

await rm(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })
console.log(`copied templates -> ${dest}`)
