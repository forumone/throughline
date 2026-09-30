/*
Which connection string to connect with, and the name of the variable it came
from.

Three things make this more than `process.env.DATABASE_URI!`.

**The Vercel–Neon integration does not set `DATABASE_URI`.** It injects
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING` and friends. Left alone, the first deploy fails at
page-data collection with a connection error that says nothing about a missing
variable.

**The app wants the pooler and a migration cannot use it.** Neon's pooled
endpoint is PgBouncer in transaction mode: right for a serving function, whose
connections are many and short, and unusable for DDL, where Drizzle relies on
prepared statements and session state. `migrate` hangs or fails partway. The two
hostnames differ only by a `-pooler` suffix on the endpoint id.

**`DATABASE_URI` leads both lists, deliberately.** It is the variable you scope
per environment — a Preview-scoped `DATABASE_URI` pointing at a preview branch —
while the integration's variables are project-wide and resolve to production. A
preview build that fell through to one of those while migrating would migrate
production.

If you deploy somewhere other than Vercel + Neon, set `DATABASE_URI` and the
rest of the list is never consulted.
*/
const RUNTIME_CANDIDATES = [
  'DATABASE_URI',
  // Neon via the Vercel integration, pooled. Correct for a serving instance.
  'DATABASE_URL',
  'POSTGRES_URL',
  // Direct, as a fallback: a project with no pooler still boots.
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const

/*
The DDL path: an optional migration-only credential first, then direct endpoints
ahead of pooled ones. The pooled pair is kept at the end rather than dropped, so
a migration whose only reachable string is pooled meets the explanation in
`describeProblem` instead of "no connection string".

`MIGRATION_DATABASE_URL` lets the app run as a role that can read and write rows
and no more, while migrations run as the schema owner. It is consulted only by
the process that migrates — see `isMigrationProcess` — because a platform with
no build-only variables would otherwise hand the DDL role straight back to the
running app.
*/
const MIGRATION_CANDIDATES = [
  'MIGRATION_DATABASE_URL',
  'DATABASE_URI',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'POSTGRES_URL',
] as const

/**
 * Whether this process is `payload migrate` rather than a server or a build.
 *
 * `PAYLOAD_MIGRATING=1` is set by the `migrate` script in package.json and by
 * nothing else. `NEXT_RUNTIME` is defined in every server bundle Next emits, so
 * no route or page can satisfy both conditions even if the first were set.
 */
export function isMigrationProcess(): boolean {
  return process.env.PAYLOAD_MIGRATING === '1' && !process.env.NEXT_RUNTIME
}

let announced = false

/*
One line in the deploy log saying which variable a migration connected through.
Without it, a migration that quietly fell through to the app's credential looks
exactly like one that worked. The name, never the value: a build log is not a
secret store.
*/
function announceMigrationCredential(name: string): void {
  if (announced) return
  announced = true
  process.stderr.write(`payload migrate: connecting via ${name}\n`)
}

/*
What is wrong with a connection string, in words, before Postgres says
"password authentication failed" and leaves you guessing. A string wrapped in
quotes or prefixed with `psql` fails as `getaddrinfo ENOTFOUND`; a masked or
truncated password fails as an auth error. The checks below catch the shapes
that can be seen without connecting. Nothing here ever prints the value.
*/
function describeProblem(name: string, value: string, migrating: boolean): string | undefined {
  const raw = value.trim()

  if (/^psql\s/i.test(raw)) {
    return `${name} starts with "psql". Copy the connection string itself, not the command that uses it.`
  }
  if (/^["']|["']$/.test(raw)) {
    return `${name} is wrapped in quotes. Most hosts store the value literally — paste it without them.`
  }
  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    return `${name} does not start with postgres:// or postgresql://.`
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return `${name} is not a valid URL.`
  }

  if (!url.password) {
    return `${name} has no password. Neon's console masks it until you reveal or copy it.`
  }
  if (/^[•*·]+$/.test(decodeURIComponent(url.password))) {
    return `${name}'s password is a row of bullets — it was copied while the console still had it masked.`
  }
  if (migrating && url.hostname.includes('-pooler')) {
    return (
      `${name} points at Neon's pooled endpoint. Migrations need the direct one: PgBouncer in ` +
      `transaction mode does not support the prepared statements Drizzle's DDL relies on. Use ` +
      `the host without "-pooler".`
    )
  }

  return undefined
}

/**
 * The connection string, and the name of the variable it came from.
 *
 * The name matters: `DATABASE_URI` leads both lists, so one left in a shell or a
 * pulled `.env` file wins without saying so, and every Neon branch's database is
 * called `neondb` — the host and database name alone may not tell you which
 * environment you are about to write to. See `scripts/lib/target.ts`.
 */
export function resolveDatabaseConnection(): { name: string; value: string } {
  const migrating = isMigrationProcess()
  const candidates: readonly string[] = migrating ? MIGRATION_CANDIDATES : RUNTIME_CANDIDATES

  for (const name of candidates) {
    const value = process.env[name]
    if (value && value.trim() !== '') {
      const problem = describeProblem(name, value, migrating)
      if (problem) throw new Error(problem)
      if (migrating) announceMigrationCredential(name)
      return { name, value: value.trim() }
    }
  }

  throw new Error(
    `No database connection string. Set DATABASE_URI, or connect a Neon database in Vercel — ` +
      `the integration provides ${candidates.slice(1).join(', ')}, and every one was empty.`,
  )
}

export function databaseConnectionString(): string {
  return resolveDatabaseConnection().value
}
