import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- a plain-JavaScript build script, typed by its use here
import { computeTable } from '../../scripts/migrate-table.mjs'
import committed from './exports.json' with { type: 'json' }
import { migrateImports } from './cli.js'
import { rewriteSource } from './rewrite.js'

describe('the export table', () => {
  // A TypeScript program over both packages: seconds alone, longer on a
  // runner testing every package at once.
  it('is what the packages export now: run scripts/migrate-table.mjs when it is not', () => {
    expect(computeTable()).toEqual(committed)
  }, 60_000)
})

describe('rewriteSource', () => {
  it('splits one 0.x import across the 1.0 entries its names went to', () => {
    const { text, unresolved } = rewriteSource(
      "import { assertEnvironment, auditPlugin, createInngestClient } from '@forumone/throughline-core'\n",
    )
    expect(unresolved).toEqual([])
    expect(text).toBe(
      [
        "import { assertEnvironment } from '@forumone/throughline'",
        "import { auditPlugin } from '@forumone/throughline/audit'",
        "import { createInngestClient } from '@forumone/throughline/jobs/inngest'",
        '',
      ].join('\n'),
    )
  })

  it('keeps `import type`, inline `type` and aliases', () => {
    const { text } = rewriteSource(
      [
        "import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'",
        "import { publishingPlugin as publishing, type PublishingPluginOptions } from '@forumone/throughline-publishing'",
      ].join('\n'),
    )
    expect(text).toBe(
      [
        "import type { McpToolDefinition } from '@forumone/throughline'",
        "import { publishingPlugin as publishing, type PublishingPluginOptions } from '@forumone/throughline/publishing'",
      ].join('\n'),
    )
  })

  it('renames a renamed name, keeping the local name the file uses', () => {
    const { text } = rewriteSource(
      "import { DEFAULT_AUDIT_COLLECTION_SLUG } from '@forumone/throughline-audit'",
    )
    expect(text).toBe(
      "import { DEFAULT_AUDIT_SLUG as DEFAULT_AUDIT_COLLECTION_SLUG } from '@forumone/throughline/audit'",
    )
  })

  it('places a name two entries export by the 0.x path it came from', () => {
    expect(
      rewriteSource("import type { ContentField } from '@forumone/throughline-design-contract'")
        .text,
    ).toBe("import type { ContentField } from '@forumone/throughline-design-system/contract'")
    expect(
      rewriteSource(
        "import type { ContentField } from '@forumone/throughline-design-system-payload/generate'",
      ).text,
    ).toBe("import type { ContentField } from '@forumone/throughline-design-system/generate'")
  })

  it('moves the rest of a declaration and leaves a removed name where it was, with the reason', () => {
    const { text, unresolved } = rewriteSource(
      "import { getEmailFunctions, emailPlugin } from '@forumone/throughline-email'",
    )
    expect(text).toBe(
      [
        "import { emailPlugin } from '@forumone/throughline/email'",
        "import { getEmailFunctions } from '@forumone/throughline-email'",
      ].join('\n'),
    )
    expect(unresolved).toEqual([
      { line: 1, message: expect.stringContaining('getEmailFunctions: internal') },
    ])
  })

  it('rewrites admin component paths, in either quote', () => {
    const { text } = rewriteSource(
      [
        "const a = '@forumone/throughline-publishing/client#PublishButton'",
        '  "@forumone/throughline-core/rsc#UsedOnPanel": UsedOnPanel,',
        "const c = '@forumone/throughline-design-system-payload/client#BlockSummary'",
      ].join('\n'),
    )
    expect(text).toBe(
      [
        "const a = '@forumone/throughline/client#PublishButton'",
        '  "@forumone/throughline/rsc#UsedOnPanel": UsedOnPanel,',
        "const c = '@forumone/throughline-design-system/client#BlockSummary'",
      ].join('\n'),
    )
  })

  it('points a mock and a module augmentation at the counterpart, and asks for a look', () => {
    const { text, review } = rewriteSource(
      [
        "vi.mock('@forumone/throughline-publishing', () => ({}))",
        "declare module '@forumone/throughline-core/events' {}",
      ].join('\n'),
    )
    expect(text).toBe(
      [
        "vi.mock('@forumone/throughline/publishing', () => ({}))",
        "declare module '@forumone/throughline/jobs' {}",
      ].join('\n'),
    )
    expect(review).toHaveLength(2)
  })

  it('leaves a file with nothing to do alone', () => {
    const source = "import { x } from 'somewhere-else'\n"
    expect(rewriteSource(source)).toEqual({
      text: source,
      changed: false,
      review: [],
      unresolved: [],
    })
  })
})

describe('throughline migrate-imports', () => {
  async function project() {
    const dir = await mkdtemp(join(tmpdir(), 'migrate-imports-'))
    await mkdir(join(dir, 'src'))
    await mkdir(join(dir, 'node_modules', 'x'), { recursive: true })
    await writeFile(
      join(dir, 'src', 'a.ts'),
      "import { auditPlugin } from '@forumone/throughline-core'\n",
    )
    await writeFile(
      join(dir, 'node_modules', 'x', 'b.ts'),
      "import { auditPlugin } from '@forumone/throughline-core'\n",
    )
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { '@forumone/throughline-core': '^0.15.0' } }),
    )
    return dir
  }
  const silent = () => {
    const lines: string[] = []
    return {
      lines,
      out: { stdout: (l: string) => lines.push(l), stderr: (l: string) => lines.push(l) },
    }
  }

  it('reports and writes nothing on --dry-run', async () => {
    const dir = await project()
    const { lines, out } = silent()
    expect(await migrateImports([dir, '--dry-run'], out)).toBe(0)
    expect(lines[0]).toBe('Would rewrite 1 file.')
    expect(lines.join('\n')).toContain('@forumone/throughline-core')
    expect(await readFile(join(dir, 'src', 'a.ts'), 'utf8')).toContain('@forumone/throughline-core')
    await rm(dir, { recursive: true, force: true })
  })

  it('rewrites, skipping node_modules', async () => {
    const dir = await project()
    const { out } = silent()
    expect(await migrateImports([dir], out)).toBe(0)
    expect(await readFile(join(dir, 'src', 'a.ts'), 'utf8')).toBe(
      "import { auditPlugin } from '@forumone/throughline/audit'\n",
    )
    expect(await readFile(join(dir, 'node_modules', 'x', 'b.ts'), 'utf8')).toContain(
      '@forumone/throughline-core',
    )
    await rm(dir, { recursive: true, force: true })
  })

  it('exits 1 when something is left unresolved', async () => {
    const dir = await project()
    await writeFile(
      join(dir, 'src', 'c.ts'),
      "import { createMcpToolCollector } from '@forumone/throughline-core'\n",
    )
    const { lines, out } = silent()
    expect(await migrateImports([dir], out)).toBe(1)
    expect(lines.join('\n')).toContain('createMcpToolCollector: internal')
    await rm(dir, { recursive: true, force: true })
  })
})
