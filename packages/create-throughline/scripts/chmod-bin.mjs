// Make the published bin executable. tsc emits 0o644; package managers want
// the bin to be executable on POSIX systems before linking.
import { chmod } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bin = resolve(here, '..', 'dist', 'bin.js')
await chmod(bin, 0o755)
console.log(`chmod 0755 ${bin}`)
