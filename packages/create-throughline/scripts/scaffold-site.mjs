#!/usr/bin/env node
/*
Generates a site from this checkout's scaffolder, wired to this checkout's
packages: what CI's `scaffold` job then installs, checks and builds.

  node scripts/scaffold-site.mjs <target-dir> <tarball-dir>

<tarball-dir> holds `pnpm pack` output for @forumone/throughline and
@forumone/throughline-design-system. The site's dependencies name the versions
this checkout would publish, which npm does not have yet for an unmerged change,
so a pnpm override points each at its tarball instead. Everything else the site
installs comes from npm, as it would for anybody running `pnpm create`.

Runs the built generator (`dist/`), the same code the CLI calls, with the
answers a person would most often give, and without the prompts.
*/
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { generate } from '../dist/generator.js'

const [targetArg, tarballArg] = process.argv.slice(2)
if (!targetArg || !tarballArg) {
  console.error('Usage: node scripts/scaffold-site.mjs <target-dir> <tarball-dir>')
  process.exit(2)
}
const target = resolve(targetArg)
const tarballs = resolve(tarballArg)

await generate({
  targetDir: target,
  projectName: 'scaffold-check',
  packageScope: 'scaffold-check',
  useReferenceDs: true,
  initializeGit: false,
  installDeps: false,
  deploymentPlatform: 'vercel',
  databasePlatform: 'neon',
})

const packed = await readdir(tarballs)
const tarballFor = (name) => {
  // `pnpm pack` names @scope/name-1.2.3 as scope-name-1.2.3.tgz.
  const prefix = name.replace(/^@/, '').replace('/', '-') + '-'
  const matches = packed.filter(
    (file) => file.startsWith(prefix) && /^\d/.test(file.slice(prefix.length)),
  )
  if (matches.length !== 1) {
    throw new Error(
      `Expected one tarball for ${name} in ${tarballs}, found: ${matches.join(', ') || 'none'}`,
    )
  }
  return `file:${join(tarballs, matches[0])}`
}

const manifestPath = join(target, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.pnpm = {
  ...manifest.pnpm,
  overrides: {
    ...manifest.pnpm?.overrides,
    '@forumone/throughline': tarballFor('@forumone/throughline'),
    '@forumone/throughline-design-system': tarballFor('@forumone/throughline-design-system'),
  },
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(`Generated ${target}, using this checkout's packages from ${tarballs}.`)
