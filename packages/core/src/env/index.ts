import type { EnvRequirement } from '@forumone/throughline-plugin-contract'

/*
Check the environment once, and report everything that is wrong at the same
time.

Without this each plugin validates its own variables in registration order and
throws on the first one it finds, so a deploy missing four variables fails four
times — and each failure arrives as a stack trace inside `next build`'s "Failed
to collect page data", which reads like a build problem rather than a
configuration one, and names a plugin rather than the variable.

The plugins export what they need as data (`approvalsEnv`, `emailEnv`,
`formsEnv`) and check it at init with `checkEnvValue` below, so the list a site
asserts and the check a plugin enforces cannot drift apart.

Deliberately not a schema library: the rules are two, and a dependency for them
would be worse than the code.
*/

/** What is wrong with one value. `undefined` from `checkEnvValue` means nothing. */
export type EnvValueProblem =
  { kind: 'missing' } | { kind: 'too-short'; length: number; minLength: number }

/**
 * Checks one value against one requirement, without saying where the value
 * came from. A plugin calls it on `options.x ?? process.env[requirement.name]`
 * and words the error its own way; `assertEnvironment` calls it on the
 * environment alone.
 *
 * Empty and whitespace-only count as missing. The length is the value's own,
 * untrimmed, which is what the code that uses it will see.
 */
export function checkEnvValue(
  requirement: EnvRequirement,
  value: string | undefined,
): EnvValueProblem | undefined {
  if (value === undefined || value.trim() === '') return { kind: 'missing' }
  const { minLength } = requirement
  if (minLength !== undefined && value.length < minLength) {
    return { kind: 'too-short', length: value.length, minLength }
  }
  return undefined
}

/**
 * Anything `assertEnvironment` accepts: a requirement, a plugin's list of
 * them, or a function that throws when something is wrong — for a rule that is
 * not "this name, this long", such as a database URL that may arrive under any
 * of several names. The thrown message becomes the problem's line, so it must
 * not contain the value either.
 */
export type EnvironmentCheck = EnvRequirement | readonly EnvRequirement[] | (() => unknown)

/** The error `assertEnvironment` throws. `problems` holds one line per problem. */
export class EnvironmentError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    const count = problems.length
    super(
      [
        `Configuration problem: ${count} environment variable${count === 1 ? '' : 's'} ` +
          `${count === 1 ? 'is' : 'are'} missing or invalid. This is not a code or build ` +
          `failure; nothing will start until ${count === 1 ? 'it is' : 'they are'} set.`,
        '',
        ...problems.map((line) => `  - ${line}`),
        '',
        "Set each in the environment this process runs in (.env locally, your host's " +
          'settings when deployed). One that is set and still listed is not reaching the ' +
          'process: a turbo task passes only the variables its turbo.json `env` declares.',
      ].join('\n'),
    )
    this.name = 'EnvironmentError'
    this.problems = problems
  }
}

/**
 * Checks every requirement against `process.env` and throws one
 * {@link EnvironmentError} listing every missing or too-short value, each with
 * its `why`. Values are never printed — a too-short one is reported by length.
 *
 * Call it first in `payload.config.ts`, at module scope, with every plugin's
 * list and the site's own variables:
 *
 * ```ts
 * assertEnvironment(
 *   approvalsEnv,
 *   emailEnv,
 *   formsEnv,
 *   { name: 'PAYLOAD_SECRET', minLength: 32, why: 'Signs Payload sessions.' },
 *   () => databaseConnectionString(),
 * )
 * ```
 *
 * A name listed twice is reported once, against the strictest `minLength`.
 */
export function assertEnvironment(...checks: readonly EnvironmentCheck[]): void {
  const requirements = new Map<string, { minLength?: number; whys: string[] }>()
  const problems: string[] = []

  for (const check of checks) {
    if (typeof check === 'function') {
      try {
        check()
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }
      continue
    }
    for (const requirement of isList(check) ? check : [check]) {
      const seen = requirements.get(requirement.name)
      if (!seen) {
        requirements.set(requirement.name, {
          ...(requirement.minLength !== undefined ? { minLength: requirement.minLength } : {}),
          whys: [requirement.why],
        })
        continue
      }
      if (requirement.minLength !== undefined) {
        seen.minLength = Math.max(seen.minLength ?? 0, requirement.minLength)
      }
      if (!seen.whys.includes(requirement.why)) seen.whys.push(requirement.why)
    }
  }

  // Requirements first, in the order given; then the free-form checks.
  const lines: string[] = []
  for (const [name, { minLength, whys }] of requirements) {
    const requirement: EnvRequirement = {
      name,
      why: whys.join(' '),
      ...(minLength !== undefined ? { minLength } : {}),
    }
    const problem = checkEnvValue(requirement, process.env[name])
    if (problem) lines.push(describe(requirement, problem))
  }
  lines.push(...problems)

  if (lines.length > 0) throw new EnvironmentError(lines)
}

function isList(check: EnvironmentCheck): check is readonly EnvRequirement[] {
  return Array.isArray(check)
}

function describe(requirement: EnvRequirement, problem: EnvValueProblem): string {
  const what =
    problem.kind === 'missing'
      ? `${requirement.name} is not set.`
      : `${requirement.name} is ${problem.length} characters; the minimum is ${problem.minLength}.`
  return `${what} ${requirement.why}`
}
