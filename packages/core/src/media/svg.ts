/*
Strip everything from an SVG that makes it a document rather than a picture.

**Why this exists rather than Payload's `validateSvg`.** Payload ships one, and
it does not run here. `checkFileRestrictions` — which holds both `validateSvg`
and the `mimeTypes` allowlist — is called from `generateFileData` *after* an
early return for uploads with no buffer, and `clientUploads: true` on
`vercelBlobStorage` means the browser PUTs straight to Blob and the document
arrives with metadata and no bytes. So on this deployment neither check runs.
Payload's own denylist also skips an SVG carrying an XML prologue
(`checkFileRestrictions.js` reclassifies those and calls `validateSvg` only in
the branch below), which is the specific hole #486 F-05 describes.

**An allowlist, not a denylist.** Elements and attributes not named here are
removed. A denylist of "script and onclick" is a list of the tricks somebody had
already thought of; SVG has `<foreignObject>`, `<set attributeName="onload">`,
`javascript:` in an `href`, external `<use>`, entity declarations that read local
files, and more arriving with each specification. What a logo needs is a small,
closed set of shapes.

**Sanitise rather than refuse**, because refusing an SVG that is 99% a logo and
1% a stray `<metadata>` block teaches people to convert to PNG and lose the
thing SVG is for. What is removed is reported, so the caller can say so.

No dependency. A parser would be better at pathological input, and every option
is either a browser DOM (not present on the server), a JSDOM-based sanitiser
(large, and its own supply-chain surface), or an XML parser with the same
entity-expansion problems this is guarding against. What runs here is a
restrictive rewrite over a small grammar, and the tests are the argument for it.
*/

/** Elements a logo or icon legitimately contains. Everything else is removed. */
const ALLOWED_ELEMENTS = new Set([
  'circle',
  'clippath',
  'defs',
  'ellipse',
  'g',
  'line',
  'lineargradient',
  'mask',
  'path',
  'polygon',
  'polyline',
  'radialgradient',
  'rect',
  'stop',
  'svg',
  'symbol',
  'title',
  'use',
])

/**
 * Attributes those elements may carry.
 *
 * Presentation attributes and geometry, and nothing that names a destination.
 * `href` and `xlink:href` are absent deliberately: an external `<use>` pulls a
 * document from somewhere else, and a `javascript:` href in an `<a>` is a
 * script by another name. A logo referencing another file is not a logo.
 */
const ALLOWED_ATTRIBUTES = new Set([
  'clip-path',
  'clip-rule',
  'cx',
  'cy',
  'd',
  'fill',
  'fill-opacity',
  'fill-rule',
  'gradienttransform',
  'gradientunits',
  'height',
  'id',
  'mask',
  'offset',
  'opacity',
  'points',
  'preserveaspectratio',
  'r',
  'rx',
  'ry',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'style',
  'transform',
  'viewbox',
  'width',
  'x',
  'x1',
  'x2',
  'xmlns',
  'y',
  'y1',
  'y2',
])

export interface SanitizedSvg {
  /** The cleaned document. */
  svg: string
  /** What was taken out, for a message somebody can act on. Empty when nothing was. */
  removed: string[]
}

/**
 * Rewrite an SVG to the allowlist above.
 *
 * `removed` is a set of short labels — `<script>`, `onload`, `href` — rather
 * than the offending source, because the caller puts them in front of an editor
 * and a truncated payload is neither reassuring nor useful.
 */
export function sanitizeSvg(source: string): SanitizedSvg {
  const removed = new Set<string>()
  let svg = source

  /*
  Comments first, and before anything else looks at the string. A comment can
  contain a `>` or a partial tag, so a later pass that trusted tag boundaries
  would read the wrong ones. Removing them also removes the usual hiding place
  for a payload assembled by something downstream.
  */
  svg = svg.replace(/<!--[\s\S]*?-->/g, '')

  /*
  Doctype and entity declarations. `<!DOCTYPE svg [<!ENTITY xxe SYSTEM
  "file:///etc/passwd">]>` is the XXE that makes a picture read a file, and
  billion-laughs is the same construct pointed at memory. Nothing a logo needs
  lives in a DTD.
  */
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, () => {
    removed.add('<!DOCTYPE>')
    return ''
  })
  svg = svg.replace(/<!ENTITY[\s\S]*?>/gi, () => {
    removed.add('<!ENTITY>')
    return ''
  })

  /*
  Elements that carry executable or embedded content, removed with their
  contents rather than just their tags — an unwrapped `<script>` body is still
  the script, sitting as text where a later consumer may find it.
  */
  for (const name of ['script', 'foreignObject', 'iframe', 'embed', 'object', 'annotation-xml']) {
    const withContents = new RegExp(`<${name}\\b[\\s\\S]*?</${name}\\s*>`, 'gi')
    const selfClosing = new RegExp(`<${name}\\b[^>]*/?>`, 'gi')
    svg = svg.replace(withContents, () => {
      removed.add(`<${name}>`)
      return ''
    })
    svg = svg.replace(selfClosing, () => {
      removed.add(`<${name}>`)
      return ''
    })
  }

  /*
  `<style>` goes too, contents and all. CSS in an SVG can reach the network
  through `@import` and `url()`, and a logo's colours belong on the shapes.
  */
  svg = svg.replace(/<style\b[\s\S]*?<\/style\s*>/gi, () => {
    removed.add('<style>')
    return ''
  })

  /*
  `<animate>` and friends are removed for one specific reason rather than a
  general dislike of animation: `<set attributeName="onload" to="alert(1)">`
  writes an event handler onto its parent at run time, so an attribute filter
  alone does not hold.
  */
  for (const name of ['animate', 'animateMotion', 'animateTransform', 'set']) {
    svg = svg.replace(new RegExp(`<${name}\\b[^>]*/?>`, 'gi'), () => {
      removed.add(`<${name}>`)
      return ''
    })
    svg = svg.replace(new RegExp(`<${name}\\b[\\s\\S]*?</${name}\\s*>`, 'gi'), () => {
      removed.add(`<${name}>`)
      return ''
    })
  }

  // Every remaining tag, filtered to the allowlist and its attributes cleaned.
  svg = svg.replace(
    /<\/?([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (tag, rawName, rawAttrs) => {
      /*
    Lowercase to *look up*, and emit what was written. SVG element and
    attribute names are case-sensitive — `viewBox`, `linearGradient`,
    `clipPath`, `preserveAspectRatio` — so a sanitiser that normalised case
    would hand back a document that passes every check here and renders as
    nothing, which is a worse failure than refusing it.
    */
      const name = String(rawName)
      const lookup = name.toLowerCase()

      if (!ALLOWED_ELEMENTS.has(lookup)) {
        removed.add(`<${lookup}>`)
        return ''
      }

      if (tag.startsWith('</')) return `</${name}>`

      const attrs = String(rawAttrs)
      const kept: string[] = []

      for (const match of attrs.matchAll(
        /([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g,
      )) {
        const attrName = match[1]!
        const attrLookup = attrName.toLowerCase()
        const rawValue = match[2]!
        const value = rawValue.replace(/^["']|["']$/g, '')

        if (!ALLOWED_ATTRIBUTES.has(attrLookup) || attrLookup.startsWith('on')) {
          removed.add(attrLookup)
          continue
        }

        /*
      A `style` that reaches the network is not styling. `url(` covers
      `background-image`, `@import` covers a stylesheet, and both are the whole
      of how CSS inside an SVG fetches anything.
      */
        if (attrLookup === 'style' && /url\s*\(|@import|expression\s*\(/i.test(value)) {
          removed.add('style')
          continue
        }

        /*
      A scheme smuggled past the attribute allowlist. Entities and control
      characters are stripped before the test because `java&#115;cript:` and
      `java\tscript:` both parse as the scheme in a browser and neither matches
      a naive comparison.
      */
        const collapsed = value
          .replace(/&#[xX]?[0-9a-fA-F]+;?/g, '')
          // A NUL or a tab inside `java\u0000script:` is still the scheme to a
          // browser, so stripping control characters is the point rather than
          // an accident — which is what the rule below is there to catch.
          // eslint-disable-next-line no-control-regex
          .replace(/[\s\u0000-\u001F]/g, '')
        if (/^(javascript|data|vbscript):/i.test(collapsed)) {
          removed.add(attrLookup)
          continue
        }

        kept.push(
          `${attrName}=${rawValue.startsWith('"') || rawValue.startsWith("'") ? rawValue : `"${value}"`}`,
        )
      }

      const selfClosing = attrs.trimEnd().endsWith('/') ? ' /' : ''
      return kept.length > 0
        ? `<${name} ${kept.join(' ')}${selfClosing}>`
        : `<${name}${selfClosing}>`
    },
  )

  return { svg, removed: [...removed].sort() }
}

/** Whether a sanitised document still contains an `<svg>` root worth storing. */
export function isRenderableSvg(svg: string): boolean {
  return /<svg[\s>]/i.test(svg)
}
