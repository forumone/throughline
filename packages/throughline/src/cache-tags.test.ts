import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createCacheTags, defaultCacheTags } from './cache-tags.js'

describe('createCacheTags', () => {
  /*
  The collection default is the bare slug because that is what
  `revalidateOnPublishJob` has always fired. A reader that tagged
  `pages` before this module existed keeps being invalidated.
  */
  it('defaults to the bare slug for a collection and global_<slug> for a global', () => {
    expect(defaultCacheTags.collection('pages')).toBe('pages')
    expect(defaultCacheTags.global('navigation')).toBe('global_navigation')
  })

  // The mistake that made a hook a no-op: one end prefixed, the other not.
  it('keeps a collection and a global of the same slug apart', () => {
    expect(defaultCacheTags.collection('pages')).not.toBe(defaultCacheTags.global('pages'))
  })

  it('takes either builder from the scheme and defaults the other', () => {
    const tags = createCacheTags({ global: (slug) => `site:${slug}` })
    expect(tags.global('footer')).toBe('site:footer')
    expect(tags.collection('posts')).toBe('posts')
  })

  it('refuses to build an empty tag, which would drop nothing and say nothing', () => {
    const tags = createCacheTags({ collection: () => '' })
    expect(() => tags.collection('pages')).toThrow(/empty collection tag for "pages"/)
  })

  /*
  It is published on its own subpath so frontend code can import it without
  importing Payload, publishing or Inngest. That only holds while it imports
  nothing.
  */
  it('imports nothing', async () => {
    const source = await readFile(new URL('./cache-tags.ts', import.meta.url), 'utf-8')
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})
