import { describe, expect, it } from 'vitest'
import { isRenderableSvg, sanitizeSvg } from './svg.js'

/*
The sanitiser is an allowlist, so the interesting tests are in two directions:
a real logo survives intact, and every trick anybody has written down does not.

These matter more than most tests in this repo because nothing else checks this
work. Payload ships `validateSvg` and it does not run here — `checkFileRestrictions`
holds it, and `generateFileData` returns before calling that whenever an upload
arrives with no buffer, which is every upload once `clientUploads: true` sends
the browser straight to Blob. #486 F-05.
*/

const LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40">
  <title>Acme</title>
  <g fill="#123456" transform="translate(2 2)">
    <path d="M0 0 L10 10 Z" fill-rule="evenodd" />
    <circle cx="20" cy="20" r="8" stroke="#000" stroke-width="2" />
    <rect x="30" y="0" width="10" height="10" opacity="0.5" />
  </g>
</svg>`

describe('a real logo survives', () => {
  const { svg, removed } = sanitizeSvg(LOGO)

  it('removes nothing from it', () => {
    expect(removed).toEqual([])
  })

  it('keeps the shapes and their geometry', () => {
    for (const fragment of [
      '<svg ',
      'viewBox="0 0 100 40"',
      '<path d="M0 0 L10 10 Z"',
      '<circle cx="20" cy="20" r="8"',
      'stroke-width="2"',
      'transform="translate(2 2)"',
      'fill="#123456"',
    ]) {
      expect(svg).toContain(fragment)
    }
  })

  it('is still an SVG', () => {
    expect(isRenderableSvg(svg)).toBe(true)
  })
})

describe('script, in each of its disguises', () => {
  it.each([
    [
      'a script element',
      '<svg xmlns="x"><script>alert(1)</script><path d="M0 0"/></svg>',
      '<script>',
    ],
    [
      'a script element with an XML prologue, which Payload skips',
      '<?xml version="1.0"?><svg xmlns="x"><script>alert(1)</script></svg>',
      '<script>',
    ],
    ['an event handler', '<svg xmlns="x" onload="alert(1)"><path d="M0 0"/></svg>', 'onload'],
    [
      'an event handler on a child',
      '<svg xmlns="x"><circle cx="1" cy="1" r="1" onclick="alert(1)"/></svg>',
      'onclick',
    ],
    [
      'a handler written at run time by <set>',
      '<svg xmlns="x"><set attributeName="onload" to="alert(1)"/></svg>',
      '<set>',
    ],
    [
      'foreignObject',
      '<svg xmlns="x"><foreignObject><body/></foreignObject></svg>',
      '<foreignObject>',
    ],
    [
      'an anchor with a javascript: href',
      '<svg xmlns="x"><a href="javascript:alert(1)">x</a></svg>',
      '<a>',
    ],
    ['an iframe', '<svg xmlns="x"><iframe src="//evil.example"></iframe></svg>', '<iframe>'],
  ])('removes %s', (_why, input, expected) => {
    const { svg, removed } = sanitizeSvg(input)
    expect(removed).toContain(expected)
    expect(svg.toLowerCase()).not.toContain('alert(1)')
    expect(svg.toLowerCase()).not.toContain('<script')
  })

  it('takes the body of a script out, not just its tags', () => {
    /*
    Unwrapping would leave the source sitting as text inside the document,
    which is a payload waiting for something downstream to find it.
    */
    const { svg } = sanitizeSvg('<svg xmlns="x"><script>window.x=1</script></svg>')
    expect(svg).not.toContain('window.x')
  })
})

describe('reaching off the document', () => {
  it.each([
    ['an external use', '<svg xmlns="x"><use href="//evil.example/a.svg#x"/></svg>', 'href'],
    [
      'an xlink href',
      '<svg xmlns="x"><use xlink:href="//evil.example/a.svg#x"/></svg>',
      'xlink:href',
    ],
    ['an image element', '<svg xmlns="x"><image href="//evil.example/a.png"/></svg>', '<image>'],
    [
      'a style element',
      '<svg xmlns="x"><style>@import url(//evil.example)</style></svg>',
      '<style>',
    ],
    [
      'a style attribute that fetches',
      '<svg xmlns="x"><rect style="background:url(//evil.example)" x="0"/></svg>',
      'style',
    ],
  ])('removes %s', (_why, input, expected) => {
    const { svg, removed } = sanitizeSvg(input)
    expect(removed).toContain(expected)
    expect(svg).not.toContain('evil.example')
  })
})

describe('the DTD, which is where a picture learns to read files', () => {
  it('removes an XXE entity declaration', () => {
    const xxe =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="x"><title>&xxe;</title></svg>'
    const { svg, removed } = sanitizeSvg(xxe)
    expect(removed).toContain('<!DOCTYPE>')
    expect(svg).not.toContain('file:///etc/passwd')
    expect(svg).not.toContain('ENTITY')
  })

  it('removes a billion-laughs declaration', () => {
    const bomb =
      '<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><svg xmlns="x"><title>&b;</title></svg>'
    const { removed } = sanitizeSvg(bomb)
    expect(removed).toContain('<!DOCTYPE>')
  })
})

describe('the tricks that beat a naive filter', () => {
  it('sees through an HTML entity in a scheme', () => {
    /*
    `java&#115;cript:` is `javascript:` to a browser and is not the string
    `javascript:` to anything comparing directly.
    */
    const { removed } = sanitizeSvg('<svg xmlns="x"><use href="java&#115;cript:alert(1)"/></svg>')
    expect(removed).toContain('href')
  })

  it('sees through whitespace inside a scheme', () => {
    const { removed } = sanitizeSvg('<svg xmlns="x"><use href="java\tscript:alert(1)"/></svg>')
    expect(removed).toContain('href')
  })

  it('is not fooled by a comment hiding a tag boundary', () => {
    const { svg } = sanitizeSvg(
      '<svg xmlns="x"><!-- <path d="x"> --><script>alert(1)</script></svg>',
    )
    expect(svg).not.toContain('alert(1)')
    expect(svg).not.toContain('<!--')
  })

  it('ignores case, in elements and attributes alike', () => {
    const { svg, removed } = sanitizeSvg('<SVG xmlns="x"><SCRIPT>alert(1)</SCRIPT></SVG>')
    expect(removed).toContain('<script>')
    expect(svg).not.toContain('alert(1)')
  })

  it('drops an unknown element rather than letting it through', () => {
    /*
    The allowlist is the point: an element nobody has heard of is removed
    without anybody having to have heard of it.
    */
    const { removed } = sanitizeSvg('<svg xmlns="x"><somethingNew evil="1"/></svg>')
    expect(removed).toContain('<somethingnew>')
  })
})

describe('what the caller does with the result', () => {
  it('reports an empty removal list when nothing was wrong', () => {
    expect(sanitizeSvg(LOGO).removed).toEqual([])
  })

  it('reports each removal once, sorted, for a message somebody reads', () => {
    const { removed } = sanitizeSvg(
      '<svg xmlns="x" onload="a()"><script>b()</script><circle onclick="c()" r="1"/></svg>',
    )
    expect(removed).toEqual(['<script>', 'onclick', 'onload'])
  })

  it('notices when there is no longer an SVG worth storing', () => {
    expect(isRenderableSvg(sanitizeSvg('<html><body>not an svg</body></html>').svg)).toBe(false)
  })
})
