import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/*
Three checks on `src/migrations`, each about a failure nobody sees until the
moment it has to work.

    pnpm check:migrations

With `push: false` a migration is the only way this schema ever changes, so the
migration chain has to stay usable.

## 1. A migration with no schema snapshot

`migrate:create` does not diff the config against the database. It diffs it
against the `.json` snapshot beside the **most recent** migration, and writes one
only when it generated the SQL itself. So a migration written by hand leaves the
generator a step behind, and every run after it re-proposes a change that
already shipped — often as drizzle's interactive rename prompt, which cannot be
answered non-interactively, so the command exits having written nothing.

Every migration is checked, not only the newest: a gap in the middle is inert
today and was a blocked generator on the day it merged, which is the day this
needs to fail. Write one with `pnpm migrate:snapshot`.

## 2. An orphaned snapshot

A `.json` with no `.ts` beside it. Delete a migration and leave its snapshot,
and that snapshot sorts last and becomes what the generator diffs against — a
schema no database will ever be in.

## 3. A drop that a CASCADE has already carried out

Payload's generator can emit, in this order:

    DROP TABLE "posts" CASCADE;
    ALTER TABLE "search_rels" DROP CONSTRAINT "search_rels_posts_fk";

The CASCADE already removed that constraint, so the second statement errors,
and because a migration runs in a transaction it takes the whole migration — or
the whole rollback — with it. What is flagged is a bare `DROP CONSTRAINT` or
`DROP INDEX` that follows a cascading `DROP` in the same function. A bare drop
with no CASCADE above it is dropping something that is still there, and
demanding `IF EXISTS` of it would be the kind of blanket rule people learn to
suppress.
*/

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = path.resolve(here, '../src/migrations')

const BARE_DROP = /\bDROP\s+(CONSTRAINT|INDEX)\s+"/gi

// A `DROP` that cascaded, kept inside one statement by `[^;]*`. Not the word
// on its own, which also matches the `ON DELETE cascade` of every foreign key.
const CASCADE = /\bDROP\b[^;]*\bCASCADE\b/i

const stem = (name: string) => name.replace(/\.(json|ts)$/, '')

const entries = await readdir(MIGRATIONS).catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') return [] as string[]
  throw error
})

const files = entries.filter((name) => name.endsWith('.ts') && name !== 'index.ts').sort()

if (files.length === 0) {
  console.log('No migrations yet. Create the first with:\n\n' + '    pnpm migrate:create initial\n')
  process.exit(0)
}

// Basenames on both sides, because that is what `createMigration` sorts: it
// reads the directory, keeps the `.json`, sorts, and takes the last.
const snapshots = new Set(entries.filter((name) => name.endsWith('.json')).map(stem))

const missing = files.filter((file) => !snapshots.has(stem(file)))

if (missing.length > 0) {
  console.error(
    `${missing.length} migration(s) with no schema snapshot:\n\n` +
      missing.map((file) => `  ${file}\n  ${stem(file)}.json   <- missing`).join('\n\n') +
      '\n\nmigrate:create diffs the config against the snapshot beside the most\n' +
      'recent migration. Without one it diffs against a schema that is a step\n' +
      'behind, and re-proposes a change that has already shipped. Write it with:\n\n' +
      '    pnpm migrate:snapshot\n\n' +
      'Run it only once the migration is complete: the snapshot claims the\n' +
      'database matches the config.\n',
  )
  process.exit(1)
}

const migrationNames = new Set(files.map(stem))
const orphans = [...snapshots].filter((name) => !migrationNames.has(name)).sort()

if (orphans.length > 0) {
  console.error(
    `${orphans.length} schema snapshot(s) with no migration beside them:\n\n` +
      orphans.map((name) => `  ${name}.json`).join('\n') +
      '\n\nA snapshot sorting last is what migrate:create diffs against, so one\n' +
      'left behind by a deleted migration describes a schema no database will\n' +
      'reach. Delete it, or restore the migration it belongs to.\n',
  )
  process.exit(1)
}

const problems: Array<{ file: string; statement: string }> = []

for (const file of files) {
  const source = await readFile(path.join(MIGRATIONS, file), 'utf8')

  for (const name of ['up', 'down'] as const) {
    const start = source.indexOf(`export async function ${name}`)
    if (start === -1) continue
    const other = source.indexOf('export async function', start + 1)
    const body = source.slice(start, other === -1 ? undefined : other)

    for (const match of body.matchAll(BARE_DROP)) {
      const at = match.index ?? 0
      if (!CASCADE.test(body.slice(0, at))) continue

      const absolute = start + at
      const lineStart = source.lastIndexOf('\n', absolute) + 1
      const lineEnd = source.indexOf('\n', absolute)
      problems.push({
        file,
        statement: source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim(),
      })
    }
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.length} drop(s) after a CASCADE without IF EXISTS:\n\n` +
      problems.map((p) => `  ${p.file}\n    ${p.statement}`).join('\n\n') +
      '\n\nA preceding DROP ... CASCADE has already removed these, so the\n' +
      'migration will abort. Add IF EXISTS:\n\n' +
      '    DROP CONSTRAINT IF EXISTS "..."\n' +
      '    DROP INDEX IF EXISTS "..."\n',
  )
  process.exit(1)
}

console.log(
  `Checked ${files.length} migration(s): every drop is guarded, every migration has\n` +
    `its schema snapshot, and the generator will diff against ${stem(files.at(-1)!)}.`,
)
