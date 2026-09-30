import { execFileSync } from 'node:child_process'

/*
One copy of each package that carries React context or is a singleton.

    pnpm check:instances

**The failure this exists for.** pnpm keys a package's identity on its version
*and* its resolved peers. When two workspace packages resolve a peer differently
— one on `@types/node@^20`, another on `^24`, say — pnpm installs the same
version of `@payloadcms/ui` twice, in two directories. Two directories are two
module instances, two instances are two React contexts, and a component that
reads the context the provider did not populate gets `undefined`. In the admin
that is an intermittent 500 on one view while every other view works.

**Nothing else can see it.** `pnpm install` succeeds, typecheck, lint and every
unit test pass, because the two copies are byte-identical: the problem exists
only at module-resolution time, and only matters at render time. So this asserts
what no other gate can — that each package below resolves to exactly one
instance across the workspace. A version range is not the thing to check; the
instance is.

When it fails, compare the peers of the packages that pull in each copy and pin
the offender in `pnpm.overrides` in the root `package.json`.
*/

/**
 * Packages where a second copy is a bug rather than waste: each holds React
 * context or is a singleton by construction, so two copies fail at runtime.
 */
const SINGLETONS = ['@payloadcms/ui', 'payload', 'react', 'react-dom']

/**
 * Copies that are real but cannot reach a bundle, by version, with the reason.
 * An entry here is a claim that nothing you ship imports that copy.
 */
const ACCEPTED: Record<string, string[]> = {}

interface Instance {
  version: string
  path: string
}

/** Every resolved copy of `name`, by reading pnpm's own resolution. */
function instances(name: string): Instance[] {
  const stdout = execFileSync(
    'pnpm',
    ['ls', name, '--recursive', '--depth', 'Infinity', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
  )

  const found = new Map<string, Instance>()
  const visit = (deps: Record<string, unknown> | undefined): void => {
    for (const [depName, raw] of Object.entries(deps ?? {})) {
      const info = raw as {
        version?: string
        path?: string
        dependencies?: Record<string, unknown>
      }
      if (!info || typeof info !== 'object') continue
      if (depName === name && info.path) {
        found.set(info.path, { version: info.version ?? '?', path: info.path })
      }
      visit(info.dependencies)
    }
  }

  for (const pkg of JSON.parse(stdout) as Record<string, unknown>[]) {
    visit(pkg['dependencies'] as Record<string, unknown> | undefined)
    visit(pkg['devDependencies'] as Record<string, unknown> | undefined)
  }
  return [...found.values()]
}

function main(): void {
  let failed = false

  for (const name of SINGLETONS) {
    const all = instances(name)
    const accepted = ACCEPTED[name] ?? []
    const live = all.filter((i) => !accepted.includes(i.version))

    if (live.length <= 1) {
      const note = all.length > live.length ? `  (+${all.length - live.length} accepted)` : ''
      console.log(`  = ${name.padEnd(20)} one instance${note}`)
      continue
    }

    failed = true
    console.log(`\n  ! ${name} resolves to ${live.length} instances:\n`)
    for (const instance of live) console.log(`      ${instance.version}  ${instance.path}`)
  }

  if (!failed) {
    console.log('\nEvery singleton resolves once.')
    return
  }

  console.log(
    [
      '',
      'Two copies of the same version are still two modules, and two modules holding',
      'React context is a runtime failure no type or test can see.',
      '',
      'The usual cause is a peer that differs between workspace packages, which changes',
      "pnpm's identity hash for the dependency. Compare the peers and pin the offender",
      'in `pnpm.overrides`.',
    ].join('\n'),
  )
  process.exitCode = 1
}

main()
