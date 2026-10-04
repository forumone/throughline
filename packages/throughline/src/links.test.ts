import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as links from './links.js'
import * as publishing from './publishing/index.js'

/*
`/links` is for a link-field helper that a `'use client'` module imports too,
so it holds only while nothing it loads at run time is a package: one bare
import (`payload`, `zod`, the audit module's Inngest) and a client bundle pulls
in the server. Type-only imports are erased and do not count.
*/

/** Every module specifier a file loads at run time: `import`/`export … from`, not `import type`. */
function runtimeSpecifiers(source: string): string[] {
  const out: string[] = []
  const pattern = /^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm
  for (const match of source.matchAll(pattern)) out.push(match[1]!)
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(match[1]!)
  return out
}

describe('/links', () => {
  it('loads no package at run time, however deep', async () => {
    const seen = new Set<string>()
    const bare: string[] = []
    const visit = async (url: URL): Promise<void> => {
      if (seen.has(url.href)) return
      seen.add(url.href)
      const source = await readFile(url, 'utf-8')
      for (const specifier of runtimeSpecifiers(source)) {
        if (!specifier.startsWith('.')) {
          bare.push(`${url.pathname.split('/src/')[1]}: ${specifier}`)
          continue
        }
        await visit(new URL(specifier.replace(/\.js$/, '.ts'), url))
      }
    }
    await visit(new URL('./links.ts', import.meta.url))
    expect(bare).toEqual([])
    expect(seen.size).toBeGreaterThan(1)
  })

  it('exports the same marker as /publishing', () => {
    expect(links.LINK_TARGET_KEY).toBe(publishing.LINK_TARGET_KEY)
    expect(links.markLinkTarget).toBe(publishing.markLinkTarget)
    const marked = links.markLinkTarget({ name: 'page', type: 'relationship', relationTo: 'pages' })
    expect(links.linkTargetMarker(marked)).toBe(true)
  })
})
