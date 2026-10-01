import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ContentField } from '../generate/fields'
import type { Overrides } from '../overrides'
import { coerceBlock, type CoerceContext } from '../render/coerce'

/*
Does a contract describe the props its component takes?

Nothing else checks it. The first site on this package shipped a contract
declaring a project's `image` as a bare `image` field while the component read
`image.src` and `image.alt`. Coercion produced a URL string, both properties
came back `undefined`, and every project rendered an `<img>` with no `src` and
no `alt`. Every gate passed, each for a defensible reason: the story supplied
`{ src, alt }`, so it and the axe check were right; manifest validation does not
compare field types with props; and the renderer's registry is `any` at the
seam, which is the honest boundary between two generated shapes, so typecheck
compared nothing.

## How

Per component: build the data Payload would store for its contract, run it
through the real `coerceBlock` with the host's real overrides, and compare the
shape of each prop with the component's args file. The args file is the ground
truth because it is `satisfies <Name>Props` — TypeScript has already checked it
against the component — so a disagreement is between the contract and the
component, which is the thing being looked for.

## What it does not do

Only props in *both* the coerced output and the args are compared. Coercion adds
`<name>SrcSet` and `<name>Sizes` siblings no args file has; args carry code-only
props no contract has; and an optional field an args file does not exercise
cannot be compared with anything. Each of those is a legitimate absence, and a
shape mismatch needs both sides to describe the same prop.
*/

/** Marks a value the host rendered to React, so it is not read as a plain object. */
const NODE = Symbol('rendered-node')
const renderedNode = () => ({ [NODE]: true }) as unknown as never

/**
 * Real overrides, stubbed resolvers. Overrides change the *shape* — they omit
 * fields, rename `body` to `children`, turn an icon name into a glyph — so they
 * have to be the host's own. The resolvers turn an id into a URL or Lexical
 * state into React; a stub produces the same shape as the real thing.
 */
export function stubCoerceContext(overrides: Overrides = {}): CoerceContext {
  return {
    overrides,
    resolveMedia: () => ({
      url: 'https://example.invalid/image.webp',
      alt: 'alt text',
      width: 1200,
      srcSet: 'https://example.invalid/image.webp 1200w',
      sizes: '100vw',
    }),
    resolveHref: () => '/a-path',
    renderRichText: renderedNode,
    renderIcon: renderedNode,
  }
}

/** What Payload stores for a field of each type, filled in. */
export function storedValue(field: ContentField): unknown {
  const objectOf = (fields: ContentField[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const child of fields) out[child.name] = storedValue(child)
    return out
  }

  switch (field.type) {
    case 'text':
    case 'select':
      return 'text'
    case 'video':
      return 'https://example.invalid/video.mp4'
    case 'number':
      return 1
    case 'boolean':
      return true
    case 'richtext':
      return { root: { type: 'root', children: [] } }
    case 'link':
      return { mode: 'external', url: 'https://example.invalid' }
    case 'image':
      return { id: 1, url: 'https://example.invalid/image.webp', alt: 'alt text' }
    case 'group':
      return field.of ? objectOf(field.of) : undefined
    case 'array':
      // One row is enough to establish the row's shape.
      return field.of ? [{ id: 'row-1', ...objectOf(field.of) }] : undefined
    default:
      return undefined
  }
}

/** A whole block's stored data, for one component's fields. */
export function storedObject(fields: readonly ContentField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) out[field.name] = storedValue(field)
  return out
}

export type PropKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'node' | 'absent'

export function kindOf(value: unknown): PropKind {
  if (value === undefined || value === null) return 'absent'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') {
    const held = value as Record<PropertyKey, unknown>
    // The coerced side holds React through the stubs; the args side as JSX.
    if (held[NODE] === true || '$$typeof' in held) return 'node'
    return 'object'
  }
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'object'
}

export interface PropMismatch {
  component: string
  prop: string
  coerced: PropKind
  args: PropKind
}

/**
 * Compare two values structurally, recording where they disagree. Recurses
 * into objects and into the first element of an array, where a row's shape
 * lives; depth-limited, because a contract nests no deeper than an array of
 * groups and a cycle in an args file must not hang the check.
 */
export function compareShapes(
  component: string,
  prop: string,
  coerced: unknown,
  args: unknown,
  found: PropMismatch[],
  depth = 0,
): void {
  const a = kindOf(coerced)
  const b = kindOf(args)

  if (a === 'absent' || b === 'absent') return

  /*
  A string and a rendered node are interchangeable: a prop typed `ReactNode`
  takes both, and an args *value* cannot say which the prop declares. The
  mismatch this exists for — an object where a scalar was produced — is still
  one.
  */
  if ((a === 'string' && b === 'node') || (a === 'node' && b === 'string')) return

  if (a !== b) {
    found.push({ component, prop, coerced: a, args: b })
    return
  }

  if (depth >= 3) return

  if (a === 'object') {
    const left = coerced as Record<string, unknown>
    const right = args as Record<string, unknown>
    for (const key of Object.keys(left)) {
      if (key in right)
        compareShapes(component, `${prop}.${key}`, left[key], right[key], found, depth + 1)
    }
    return
  }

  if (a === 'array') {
    const [left] = coerced as unknown[]
    const [right] = args as unknown[]
    if (left !== undefined && right !== undefined) {
      compareShapes(component, `${prop}[]`, left, right, found, depth + 1)
    }
  }
}

/** The manifest slice this reads. */
export interface PropsManifest {
  components: Record<string, { content: { fields: ContentField[] } }>
}

export interface CheckBlockPropsOptions {
  manifest: PropsManifest
  /** Finds a component's args, or `undefined` when it has none. */
  loadArgs: (component: string) => Promise<Record<string, unknown> | undefined>
  /** The host's overrides — the same object the generator and renderer use. */
  overrides?: Overrides
}

export interface CheckBlockPropsResult {
  checked: string[]
  /** Components with no args file, which nothing could be compared with. */
  skipped: string[]
  mismatches: PropMismatch[]
}

/** Coerce every component's contract and compare the props with its args. */
export async function checkBlockProps(
  options: CheckBlockPropsOptions,
): Promise<CheckBlockPropsResult> {
  const ctx = stubCoerceContext(options.overrides)
  const result: CheckBlockPropsResult = { checked: [], skipped: [], mismatches: [] }

  for (const [name, component] of Object.entries(options.manifest.components)) {
    const args = await options.loadArgs(name)
    if (!args) {
      result.skipped.push(name)
      continue
    }

    const fields = component.content.fields ?? []
    const coerced = coerceBlock(name, fields, storedObject(fields), ctx)
    for (const prop of Object.keys(coerced)) {
      if (prop in args) compareShapes(name, prop, coerced[prop], args[prop], result.mismatches)
    }
    result.checked.push(name)
  }

  return result
}

const ARGS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs']

/**
 * Finds `<Name>/<name>args.<ext>` — the case is not guessed — in the first of
 * `componentDirs` that has one, and returns its default export.
 *
 * TypeScript args files need a loader that understands them: the
 * `check-block-props` bin registers `tsx`, and vitest transforms on its own.
 */
export function argsFileLoader(
  componentDirs: readonly string[],
): (component: string) => Promise<Record<string, unknown> | undefined> {
  return async component => {
    for (const root of componentDirs) {
      const dir = path.join(root, component)
      const entries = await readdir(dir).catch(() => [] as string[])
      const file = entries.find(entry => {
        const ext = path.extname(entry)
        return (
          ARGS_EXTENSIONS.includes(ext) &&
          entry.slice(0, -ext.length).toLowerCase() === `${component.toLowerCase()}args`
        )
      })
      if (!file) continue

      const loaded = (await import(pathToFileURL(path.join(dir, file)).href)) as {
        default?: unknown
      }
      const args = loaded.default
      return args && typeof args === 'object' ? (args as Record<string, unknown>) : undefined
    }
    return undefined
  }
}

/** The report a person reads, and whether it is a failure. */
export function formatBlockPropsResult(result: CheckBlockPropsResult): {
  ok: boolean
  text: string
} {
  if (result.mismatches.length > 0) {
    const lines = [
      '',
      `  ${result.mismatches.length} contract/component mismatch(es).`,
      '',
      '  A contract field produces a prop shape the component does not take. The',
      '  args file is `satisfies <Name>Props`, so it is the component that is right',
      '  and the contract that needs changing.',
      '',
      ...result.mismatches.map(
        m =>
          `    ${m.component}.${m.prop}: contract produces ${m.coerced}, component takes ${m.args}`,
      ),
      '',
    ]
    return { ok: false, text: lines.join('\n') }
  }

  if (result.checked.length === 0) {
    return {
      ok: false,
      text:
        `No component had an args file, so nothing was compared ` +
        `(${result.skipped.length} without one). Check the components directory, or that each ` +
        `component has a <Name>Args.ts default-exporting its props.`,
    }
  }

  return {
    ok: true,
    text:
      `Contracts agree with their components (${result.checked.length} checked` +
      (result.skipped.length > 0
        ? `, ${result.skipped.length} without an args file: ${result.skipped.join(', ')}`
        : '') +
      ').',
  }
}
