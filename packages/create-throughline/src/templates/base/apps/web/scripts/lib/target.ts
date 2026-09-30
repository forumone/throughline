import { resolveDatabaseConnection } from '../../src/lib/database'

/*
Which database a script is about to write to, and an explicit confirmation of
it. For seed, import and repair scripts:

    const where = requireTarget(process.argv, overwriting, 'Replaces every page')

A script reads its connection string from the environment like everything else,
so a shell that happens to have production's connection string loaded points it
at production and nothing asks. This prints the target before anything is
written, and demands `--confirm <database>@<host>` when the run would overwrite.

It is not authentication — anyone who can run the script can type the token. It
is the difference between a mistake and a decision, and the print alone is worth
it: a run aimed at the wrong host is visible before it writes rather than after.

Sized to the risk: creating what is missing is recoverable by deleting it;
replacing what an editor has worked on is not.
*/

export interface Target {
  host: string
  database: string
  /** The environment variable the connection string came from, or `(none)`. */
  source: string
}

/**
 * The database the config will actually connect to — through the same resolver
 * `payload.config.ts` uses, not by reading `DATABASE_URI` directly. A guard that
 * reports a different database than the code connects to is not a weaker guard;
 * it is a false one.
 */
export function target(): Target {
  let connection = ''
  let source = '(none)'
  try {
    const resolved = resolveDatabaseConnection()
    connection = resolved.value
    source = resolved.name
  } catch {
    // Nothing set at all: a target of "none", which every destructive run refuses.
  }

  try {
    const parsed = new URL(connection)
    return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, ''), source }
  } catch {
    return { host: '(unparseable)', database: '', source }
  }
}

/*
The token that has to be typed back. Not the database name on its own: Neon
names every branch's database `neondb`, so `--confirm neondb` would match
production and a preview alike. The host distinguishes them, so the host is in
the token — long enough that it cannot be typed from memory while thinking about
a different environment.
*/
export const confirmToken = (where: Target): string => `${where.database}@${where.host}`

/**
 * Print the target, and exit unless a destructive run has named it back.
 *
 * @param argv        The script's arguments, for `--confirm <database>@<host>`.
 * @param destructive Whether this run would overwrite existing documents.
 * @param consequence One line naming what would be overwritten, shown in the refusal.
 */
export function requireTarget(argv: string[], destructive: boolean, consequence: string): Target {
  const where = target()
  console.log(
    `\n  target   ${where.database || '(none)'} on ${where.host}\n  from     ${where.source}`,
  )

  if (!destructive) return where

  const index = argv.indexOf('--confirm')
  const confirmed = index === -1 ? undefined : argv[index + 1]
  const expected = confirmToken(where)

  if (where.database === '' || confirmed !== expected) {
    console.error(
      `\n  Refusing to write.\n\n` +
        `  ${consequence}\n` +
        `  in the database "${where.database}" on ${where.host},\n` +
        `  read from ${where.source}.\n\n` +
        `  Re-run with --confirm ${where.database ? expected : '<database>@<host>'}\n` +
        `  if that is what you meant.\n`,
    )
    process.exit(2)
  }

  return where
}
