import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { getPayload } from 'payload'
import config from '@payload-config'

/*
Writes the `.json` schema snapshot beside a hand-written migration.

    pnpm migrate:snapshot                 # the newest migration
    pnpm migrate:snapshot 20260812_154500_add_jobs
    pnpm migrate:snapshot --force         # replace an existing snapshot

`migrate:create` diffs the config against the snapshot beside the **most
recent** migration, and writes a fresh one only when it generates the SQL
itself. A migration written by hand therefore leaves the generator one step
behind, and every run after it re-proposes a change that already shipped.

This closes the gap the way `createMigration` does, minus the diff: it asks the
adapter for the schema the config describes and serialises it. The adapter
builds that schema from the config alone, so this needs **no database**.

## When it would be a lie

The snapshot says: *the database, once this migration has run, matches the
config.* Run it only after the hand-written migration is complete. A snapshot
claiming a config change the migration only half implements makes the next
generated migration quietly omit the missing half.

Overwriting needs `--force`, because the common mistake is running this instead
of writing the migration: the snapshot is rewritten to match a config that moved
on, and the change becomes invisible to the generator — the schema drifts with
no migration anywhere that would apply it.

The config is loaded, so the environment it validates must be present. Values
that only need to parse — secrets, keys — can be placeholders on this run.
*/

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = path.resolve(here, '../src/migrations')

// `pnpm run x -- --flag` forwards the `--` itself, which `parseArgs` would read
// as "positionals from here".
const argv = process.argv.slice(2).filter((arg) => arg !== '--')

const { positionals, values } = parseArgs({
  args: argv,
  allowPositionals: true,
  options: { force: { type: 'boolean', default: false } },
})

const migrations = (await readdir(MIGRATIONS).catch(() => [] as string[]))
  .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
  .map((name) => name.slice(0, -'.ts'.length))
  .sort()

if (migrations.length === 0) {
  console.error(`No migrations in ${MIGRATIONS}.`)
  process.exit(1)
}

const target = positionals[0]?.replace(/\.(json|ts)$/, '') ?? migrations.at(-1)!

if (!migrations.includes(target)) {
  console.error(
    `No migration named ${target}.\n\nMigrations in src/migrations:\n` +
      migrations.map((name) => `  ${name}`).join('\n') +
      '\n',
  )
  process.exit(1)
}

const destination = path.join(MIGRATIONS, `${target}.json`)
const existing = await readFile(destination, 'utf8').then(
  () => true,
  () => false,
)

if (existing && !values.force) {
  console.error(
    `${target}.json already exists, and describes the schema as of that migration.\n` +
      'Rewriting it to match a config that has since changed hides the change from\n' +
      '`migrate:create`. If replacing it is genuinely what you want, pass --force.\n',
  )
  process.exit(1)
}

if (target !== migrations.at(-1)) {
  console.warn(
    `Warning: ${target} is not the newest migration. Only the newest snapshot is\n` +
      'read by migrate:create, so this describes a state nothing will diff against.\n',
  )
}

// No database, and nothing that runs on startup (seeds, syncs, cron
// registration) from a script whose whole job is to serialise a schema.
const payload = await getPayload({ config, disableDBConnect: true, disableOnInit: true })

const db = payload.db as typeof payload.db & {
  requireDrizzleKit: () => { generateDrizzleJson: (schema: unknown) => Promise<unknown> }
  schema: unknown
}

const { generateDrizzleJson } = db.requireDrizzleKit()
const snapshot = await generateDrizzleJson(db.schema)

// Byte for byte what `createMigration` writes, with no trailing newline, so a
// hand-written migration's snapshot is indistinguishable from a generated one.
await writeFile(destination, JSON.stringify(snapshot, null, 2))

console.log(
  `Wrote src/migrations/${target}.json\n\n` +
    'Commit it beside the migration. Confirm the generator is unblocked with:\n\n' +
    '    pnpm migrate:create check --skip-empty\n\n' +
    'which exits without writing anything when there is no diff.\n',
)

process.exit(0)
