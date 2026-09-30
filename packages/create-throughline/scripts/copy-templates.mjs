// Copies src/templates -> dist/templates so the published bin can resolve
// template files relative to the compiled JS. Templates are not TS code, so
// tsc doesn't move them.
//
// Also writes dist/versions.json: the version of every published
// @forumone/throughline-* package in this workspace, which the generator
// renders into the scaffold's dependency ranges. `publish-packages` builds
// after `changeset version`, so this names exactly the set being released.
// See src/utils/versions.ts.
import { cp, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// `build` runs tsc first, so the compiled reader is already here.
import { readWorkspaceVersions } from '../dist/utils/versions.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '..', 'src', 'templates')
const dest = resolve(here, '..', 'dist', 'templates')
const packagesDir = resolve(here, '..', '..')

await rm(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })
console.log(`copied templates -> ${dest}`)

const versions = await readWorkspaceVersions(packagesDir)
const versionsFile = resolve(here, '..', 'dist', 'versions.json')
await writeFile(versionsFile, JSON.stringify(versions, null, 2) + '\n')
console.log(`wrote ${Object.keys(versions).length} package versions -> ${versionsFile}`)
