import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPackageVersions, readWorkspaceVersions } from './versions.js'

describe('package versions', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'create-throughline-versions-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function pkg(dir: string, manifest: Record<string, unknown>): Promise<void> {
    await mkdir(join(root, 'packages', dir), { recursive: true })
    await writeFile(join(root, 'packages', dir, 'package.json'), JSON.stringify(manifest))
  }

  it('reads @forumone/throughline and the published @forumone/throughline-* packages, and nothing else', async () => {
    await pkg('throughline', { name: '@forumone/throughline', version: '1.0.0' })
    await pkg('design-system', {
      name: '@forumone/throughline-design-system',
      version: '0.6.0',
    })
    await pkg('reference-ds', {
      name: '@forumone/throughline-reference-ds',
      version: '1.0.0',
      private: true,
    })
    await pkg('other', { name: 'unrelated', version: '1.0.0' })

    expect(await readWorkspaceVersions(join(root, 'packages'))).toEqual({
      '@forumone/throughline': '1.0.0',
      '@forumone/throughline-design-system': '0.6.0',
    })
  })

  it('refuses to return nothing, rather than render an empty range', async () => {
    await mkdir(join(root, 'packages'), { recursive: true })
    await expect(readWorkspaceVersions(join(root, 'packages'))).rejects.toThrow(
      /no package versions/,
    )
  })

  it('prefers versions.json beside the templates, as a published build has', async () => {
    const pkgDir = join(root, 'packages', 'create-throughline')
    await mkdir(join(pkgDir, 'dist', 'templates'), { recursive: true })
    await writeFile(
      join(pkgDir, 'dist', 'versions.json'),
      JSON.stringify({ '@forumone/throughline-design-system': '0.6.0' }),
    )
    // A workspace sibling that disagrees, to prove the baked file wins.
    await pkg('design-system', {
      name: '@forumone/throughline-design-system',
      version: '9.9.9',
    })

    expect(await loadPackageVersions(join(pkgDir, 'dist', 'templates'))).toEqual({
      version_design_system: '0.6.0',
    })
  })

  it('falls back to the workspace when running from source', async () => {
    await pkg('throughline', { name: '@forumone/throughline', version: '1.0.0' })
    await pkg('design-system', {
      name: '@forumone/throughline-design-system',
      version: '0.6.0',
    })
    const templatesDir = join(root, 'packages', 'create-throughline', 'src', 'templates')
    await mkdir(templatesDir, { recursive: true })

    expect(await loadPackageVersions(templatesDir)).toEqual({
      version_throughline: '1.0.0',
      version_design_system: '0.6.0',
    })
  })
})
