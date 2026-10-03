import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const stylesSrc = resolve(__dirname, '../src/styles')
const stylesDist = resolve(__dirname, '../dist/styles')

await mkdir(stylesDist, { recursive: true })

const entries = await readdir(stylesSrc)
const cssFiles = entries.filter((f) => f.endsWith('.css'))

for (const file of cssFiles) {
  await copyFile(resolve(stylesSrc, file), resolve(stylesDist, file))
}

// Also emit a combined bundle so consumers can import `@forumone/throughline-reference-ds/styles.css`.
const bundleParts: string[] = []
for (const file of ['reset.css', 'tokens.css', 'base.css']) {
  if (cssFiles.includes(file)) {
    const content = await readFile(resolve(stylesSrc, file), 'utf8')
    bundleParts.push(`/* ${basename(file)} */\n${content.trim()}\n`)
  }
}
await writeFile(resolve(stylesDist, 'index.css'), bundleParts.join('\n'), 'utf8')

console.log(`Copied ${cssFiles.length} CSS files to dist/styles`)
