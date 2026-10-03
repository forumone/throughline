import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ContentField } from '../generate/fields.js'
import { argsFileLoader, checkBlockProps, formatBlockPropsResult } from './checkBlockProps.js'
import { parseArgs } from './checkBlockPropsCli.js'

/*
The first site's defect, reconstructed: a contract declaring `image` as a bare
image field, against a component that reads `image.src` and `image.alt`.
Coercion produces a URL string, so the shapes disagree.
*/
const showcase: ContentField[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'image', type: 'image', required: true },
]
const showcaseArgs = { title: 'A project', image: { src: '/a.webp', alt: 'A project' } }

// A contract that agrees: an image group would coerce to an object, and a
// richtext body renders React where the args hold a string, which is allowed.
const card: ContentField[] = [
  { name: 'heading', type: 'text', required: true },
  { name: 'body', type: 'richtext', required: false },
  {
    name: 'items',
    type: 'array',
    required: false,
    // Two children: a one-child row coerces to a bare scalar, which is its own shape.
    of: [
      { name: 'label', type: 'text', required: true },
      { name: 'value', type: 'number', required: true },
    ],
  },
]
const cardArgs = {
  heading: 'Heading',
  body: 'Some text',
  items: [{ label: 'One', value: 1 }],
  className: 'x',
}

const manifest = {
  components: {
    Showcase: { content: { fields: showcase } },
    Card: { content: { fields: card } },
    Divider: { content: { fields: [] } },
  },
}

const inMemory = (table: Record<string, Record<string, unknown>>) => async (name: string) =>
  table[name]

describe('checkBlockProps', () => {
  it('reports a contract that coerces to a shape the component does not take', async () => {
    const result = await checkBlockProps({
      manifest,
      loadArgs: inMemory({ Showcase: showcaseArgs, Card: cardArgs }),
    })
    expect(result.mismatches).toEqual([
      { component: 'Showcase', prop: 'image', coerced: 'string', args: 'object' },
    ])
    expect(result.checked).toEqual(['Showcase', 'Card'])
    expect(result.skipped).toEqual(['Divider'])
    expect(formatBlockPropsResult(result).ok).toBe(false)
  })

  it('uses the overrides, which change the shape', async () => {
    // `propName` passes the field under another name, so the mismatch moves
    // with it — and comparing without the override would miss it.
    const result = await checkBlockProps({
      manifest: { components: { Showcase: manifest.components.Showcase } },
      loadArgs: inMemory({ Showcase: { title: 'x', picture: { src: '/a', alt: 'a' } } }),
      overrides: { Showcase: { fields: { image: { propName: 'picture' } } } },
    })
    expect(result.mismatches).toEqual([
      { component: 'Showcase', prop: 'picture', coerced: 'string', args: 'object' },
    ])
  })

  it('passes when the shapes agree, and says how many it compared', async () => {
    const result = await checkBlockProps({ manifest, loadArgs: inMemory({ Card: cardArgs }) })
    expect(result.mismatches).toEqual([])
    const report = formatBlockPropsResult(result)
    expect(report.ok).toBe(true)
    expect(report.text).toContain('1 checked')
  })

  it('fails when no component had an args file, rather than passing on nothing', async () => {
    const report = formatBlockPropsResult(
      await checkBlockProps({ manifest, loadArgs: inMemory({}) }),
    )
    expect(report.ok).toBe(false)
  })
})

describe('the check-block-props bin', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const bin = path.resolve(here, '../../bin/check-block-props.mjs')
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'check-block-props-'))
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
    // One layer per component, as a design system split across directories
    // would have it; one args file in TypeScript, one in plain JS, and the
    // case of the file name deliberately not the component's.
    await mkdir(path.join(dir, 'atoms/Card'), { recursive: true })
    await mkdir(path.join(dir, 'molecules/Showcase'), { recursive: true })
    await writeFile(
      path.join(dir, 'atoms/Card/cardArgs.ts'),
      `const args: Record<string, unknown> = ${JSON.stringify(cardArgs)}\nexport default args\n`,
    )
    await writeFile(
      path.join(dir, 'molecules/Showcase/ShowcaseArgs.mjs'),
      `export default ${JSON.stringify(showcaseArgs)}\n`,
    )
    await writeFile(
      path.join(dir, 'overrides.ts'),
      `export const overrides = { Showcase: { fields: { image: { omit: true as const } } } }\n`,
    )
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const run = (...args: string[]) =>
    // Bounded: a hung loader must not outlive the suite.
    spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000 })

  it('finds args files across directories, in either case, and loads TypeScript', async () => {
    const load = argsFileLoader([path.join(dir, 'atoms'), path.join(dir, 'molecules')])
    expect(await load('Card')).toEqual(cardArgs)
    expect(await load('Showcase')).toEqual(showcaseArgs)
    expect(await load('Divider')).toBeUndefined()
  })

  it('exits 1 on a mismatch, naming it', () => {
    const result = run('manifest.json', 'atoms', 'molecules')
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain(
      'Showcase.image: contract produces string, component takes object',
    )
  })

  it('exits 0 once the overrides account for it', () => {
    const result = run('manifest.json', 'atoms', 'molecules', '--overrides', 'overrides.ts')
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('2 checked')
  })

  it('exits 2 with usage when it is not told where to look', () => {
    expect(run('manifest.json').status).toBe(2)
    expect(parseArgs(['m.json', 'a', '--overrides'])).toMatch(/needs a module path/)
    expect(parseArgs(['m.json', 'a', '--tsconfig'])).toMatch(/needs a file path/)
    expect(parseArgs(['m.json', 'a', 'b', '--overrides', 'o.ts', '--tsconfig', 't.json'])).toEqual({
      manifest: 'm.json',
      componentDirs: ['a', 'b'],
      overrides: 'o.ts',
      tsconfig: 't.json',
    })
  })
})

/*
forumone-2026's design system, which the bin could not load (#207): an args file
written in TSX with the automatic runtime, beside a component whose module
imports a CSS module. The fixture sits under the package root rather than the OS
temp dir so `react/jsx-runtime` resolves from this package's node_modules, as it
would from a design system's own.
*/
describe('the check-block-props bin, on TSX args and CSS modules', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const bin = path.resolve(here, '../../bin/check-block-props.mjs')
  let dir: string

  const panel: ContentField[] = [
    { name: 'heading', type: 'text', required: true },
    { name: 'body', type: 'richtext', required: false },
  ]

  beforeAll(async () => {
    dir = await mkdtemp(path.join(here, '../../.tmp-check-block-props-'))
    await writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ components: { Panel: { content: { fields: panel } } } }),
    )
    await writeFile(
      path.join(dir, 'tsconfig.app.json'),
      JSON.stringify({ compilerOptions: { jsx: 'react-jsx', module: 'esnext' } }),
    )
    await mkdir(path.join(dir, 'components/Panel'), { recursive: true })
    await writeFile(path.join(dir, 'components/Panel/panel.module.css'), '.body { margin: 0 }\n')
    await writeFile(
      path.join(dir, 'components/Panel/Panel.tsx'),
      `import styles from './panel.module.css'\nexport const bodyClass = styles.body\n`,
    )
    await writeFile(
      path.join(dir, 'components/Panel/panelArgs.tsx'),
      `import { bodyClass } from './Panel'\n` +
        `const args = { heading: 'Heading', body: <p className={bodyClass}>Some text</p> }\n` +
        `export default args\n`,
    )
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('compiles TSX with the named tsconfig and stubs the stylesheet', () => {
    const result = spawnSync(
      process.execPath,
      [bin, 'manifest.json', 'components', '--tsconfig', 'tsconfig.app.json'],
      { cwd: dir, encoding: 'utf8', timeout: 60_000 },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('1 checked')
  })
})
