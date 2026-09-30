import { execFileSync } from 'node:child_process'

/*
`pnpm audit` over the production tree, with an allowlist that cannot rot.

    pnpm check:audit

**Why not `pnpm audit --prod --audit-level=high` on its own.** A Payload + Next
production tree is rarely clean: there are usually high advisories in it that no
request the site serves can reach. A gate that is red on every run is a gate
people stop reading.

**Why not `pnpm.auditConfig.ignoreGhsas`.** It filters, and that is all it does.
A list of ids in `package.json` carries no reason, and nothing notices when one
stops applying — the dependency is dropped or patched, and the entry sits there
suppressing a finding it no longer describes.

So this asserts the allowlist in both directions. An advisory that is not on the
list is reported. An entry that no longer appears in the audit is *also*
reported, as something to delete. That second half is why this is a script.

It is non-blocking in CI. A new advisory is news, not necessarily a defect, and
blocking every open pull request the morning a CVE is published is how a gate
gets removed rather than fixed.
*/

interface Allowed {
  ghsa: string
  module: string
  /** Which path it is on, and why that path cannot reach a request. */
  why: string
}

/**
 * High and critical advisories in the production tree that are accepted.
 *
 * "Not exploitable" is not a reason. Say which dependency path it arrives on
 * and what would have to be true for a request to reach it.
 */
const ALLOWED: Allowed[] = []

interface Advisory {
  severity: string
  module_name: string
  title: string
  github_advisory_id?: string
}

function audit(): Advisory[] {
  let stdout: string
  try {
    // Exits non-zero whenever it finds anything at or above the level, so the
    // throw is the normal case and the output is on it.
    stdout = execFileSync('pnpm', ['audit', '--prod', '--audit-level=high', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (error) {
    stdout = (error as { stdout?: string }).stdout ?? ''
  }

  if (stdout.trim() === '') return []
  const parsed = JSON.parse(stdout) as { advisories?: Record<string, Advisory> }
  // One advisory reached through several dependency paths is reported once
  // per path; it is one finding.
  const unique = new Map<string, Advisory>()
  for (const advisory of Object.values(parsed.advisories ?? {})) {
    if (advisory.severity !== 'high' && advisory.severity !== 'critical') continue
    unique.set(advisory.github_advisory_id ?? `${advisory.module_name}:${advisory.title}`, advisory)
  }
  return [...unique.values()]
}

function main(): void {
  const found = audit()
  const seen = new Set(found.map((a) => a.github_advisory_id).filter(Boolean) as string[])
  const allowed = new Map(ALLOWED.map((entry) => [entry.ghsa, entry]))

  const unexpected = found.filter(
    (a) => !a.github_advisory_id || !allowed.has(a.github_advisory_id),
  )
  const stale = ALLOWED.filter((entry) => !seen.has(entry.ghsa))

  for (const advisory of found) {
    if (advisory.github_advisory_id && allowed.has(advisory.github_advisory_id)) {
      console.log(`  = ${advisory.module_name.padEnd(18)} ${advisory.github_advisory_id}  accepted`)
    }
  }

  if (unexpected.length > 0) {
    console.log(`\n${unexpected.length} advisory/advisories not on the allowlist:\n`)
    for (const advisory of unexpected) {
      console.log(`  ! ${advisory.severity.padEnd(8)} ${advisory.module_name}`)
      console.log(`      ${advisory.github_advisory_id ?? '(no GHSA id)'} — ${advisory.title}`)
    }
    console.log(
      '\nEither upgrade past it, or add it to ALLOWED in scripts/check-audit.ts with the\n' +
        'dependency path it arrives on and why no request can reach it.',
    )
  }

  if (stale.length > 0) {
    console.log(
      `\n${stale.length} allowlist entry/entries no longer apply and should be deleted:\n`,
    )
    for (const entry of stale) console.log(`  - ${entry.ghsa}  (${entry.module})`)
  }

  if (unexpected.length === 0 && stale.length === 0) {
    console.log(`\nNothing new. ${found.length} known advisory/advisories, each with a reason.`)
    return
  }

  process.exitCode = 1
}

main()
