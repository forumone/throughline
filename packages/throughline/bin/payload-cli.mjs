/*
The Payload CLI, wrapped so a hung run cannot outlive the shell that started it.
`bin/throughline-payload.mjs` is the entry point; this module is the runner and
the pure pieces its tests exercise.

`pnpm payload generate:types` is three processes deep — shell, pnpm, node — and
pnpm (like npm and yarn) does not forward signals to the script child it
spawns. Kill the shell (a Ctrl-C, an agent tool-call timeout, a closed
terminal, a cancelled CI step) and pnpm dies while node keeps running,
reparented to PID 1. When the run was hung rather than merely slow, that orphan
spins on a core indefinitely: 48 of them piled up on one machine inside a day,
~90 CPU-minutes each, at a load average of 300.

Three layers, because no single one covers every way this exits.

1. The child is spawned `detached`, so it leads its own process group. That is
   what makes it killable as a *group* by pid — the whole subtree dies with it,
   and nothing is ever matched by process name, which would put unrelated node
   work on the same machine at risk.
2. SIGINT, SIGTERM and SIGHUP are forwarded to that group, and a wall-clock
   timeout kills it as well. Between them that covers Ctrl-C, a tool-call
   timeout, and a hangup from a closing terminal.
3. If this runner is itself SIGKILLed, no handler of ours can run. So each
   spawn is recorded in `.payload-cli-pids` at the workspace root and the
   *next* run (or `--reap`) sweeps the file. See `verdict` for what an entry
   must satisfy before anything is signalled.

PAYLOAD_CLI_TIMEOUT_MS sets the wall clock; 0 disables it. The default is five
minutes, except for the `migrate` family (`migrate`, `migrate:create`, …),
which gets none: a large migration is legitimately long, and `migrate:create`
can stop at an interactive prompt. Layers 1 and 3 apply regardless.

One more failure is the opposite of a hang: the CLI exits 0 having done nothing
(payloadcms/payload#17757). `payload-exit-guard.mjs` is preloaded into the child
to make that exit non-zero — see that file.
*/
import { execFile, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export const PID_FILE_NAME = '.payload-cli-pids'
export const DEFAULT_TIMEOUT_MS = 300_000
export const DEFAULT_GRACE_MS = 5_000
/** Exit code for "gave up waiting", as coreutils `timeout` uses. */
export const TIMEOUT_EXIT_CODE = 124

/** Preloaded into every run, so a CLI that exits 0 without finishing fails. */
// A URL, not a path: `--import` refuses a Windows drive path.
export const EXIT_GUARD = new URL('./payload-exit-guard.mjs', import.meta.url).href

/** The node argv for one run of the Payload CLI at `bin`. */
export const payloadArgv = (bin, args) => ['--import', EXIT_GUARD, bin, ...args]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (message) => process.stderr.write(`throughline-payload: ${message}\n`)

/** Collapse runs of whitespace, so `ps` column padding never decides a match. */
export const norm = (value) => (value ?? '').trim().replace(/\s+/g, ' ')

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

/**
 * `--reap` alone sweeps and exits. Anything else is passed to the Payload CLI
 * untouched, including flags that look like ours further along the argv.
 */
export function parseArgs(argv) {
  if (argv[0] === '--reap') return { mode: 'reap', args: [] }
  return { mode: 'run', args: [...argv] }
}

/** `migrate`, `migrate:create`, `migrate:status`, `migrate:fresh`, … */
export const isMigrateCommand = (args) => /^migrate(:|$)/.test(args[0] ?? '')

function readMs(env, name, fallback) {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number of milliseconds (0 disables it), got '${raw}'`)
  }
  return value
}

/**
 * The wall clock for a run, in ms; 0 means none. An explicit
 * PAYLOAD_CLI_TIMEOUT_MS always wins. A malformed one is an error rather than
 * silently "no timeout", which is the failure this exists to prevent.
 */
export function selectTimeout(args, env) {
  return readMs(env, 'PAYLOAD_CLI_TIMEOUT_MS', isMigrateCommand(args) ? 0 : DEFAULT_TIMEOUT_MS)
}

/** How long a group gets between the polite signal and SIGKILL. */
export const selectGrace = (env) => readMs(env, 'PAYLOAD_CLI_GRACE_MS', DEFAULT_GRACE_MS)

/**
 * The directory that owns the pid file: the nearest ancestor of `cwd` holding
 * `pnpm-workspace.yaml` — the workspace root, so every app in a monorepo
 * shares one file and one `payload:reap` — or, outside a pnpm workspace, the
 * nearest directory with a `package.json`. Real path, because that is what
 * the spawned command line contains.
 */
export function findRoot(cwd, exists = fs.existsSync) {
  const real = fs.realpathSync(cwd)
  let nearestPackage
  for (let dir = real; ; dir = path.dirname(dir)) {
    if (exists(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    if (!nearestPackage && exists(path.join(dir, 'package.json'))) nearestPackage = dir
    if (path.dirname(dir) === dir) break
  }
  return nearestPackage ?? real
}

const ENTRY_FIELDS = {
  pid: 'number',
  pgid: 'number',
  start: 'string',
  command: 'string',
  runnerPid: 'number',
  runnerStart: 'string',
}

/**
 * One JSON object per line. A torn line from an abrupt exit, or anything
 * missing a field verification needs, is dropped — never guessed at.
 */
export function parsePidFile(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        return []
      }
      if (!entry || typeof entry !== 'object') return []
      for (const [field, type] of Object.entries(ENTRY_FIELDS)) {
        if (typeof entry[field] !== type) return []
      }
      if (!Number.isInteger(entry.pid) || entry.pid <= 1) return []
      if (entry.pgid !== entry.pid) return [] // We only ever record group leaders.
      return [entry]
    })
}

export const serializeEntries = (entries) =>
  entries.map((entry) => `${JSON.stringify(entry)}\n`).join('')

/**
 * What the sweep does with one recorded entry, given what `ps` reports now
 * (`undefined` fields mean the pid is gone):
 *
 *   'forget' — the pid is gone, or it is no longer the process we recorded:
 *              its start time differs (the OS recycled the pid), its command
 *              line differs, or that command line is not rooted in this
 *              workspace. Nothing is signalled.
 *   'keep'   — it is ours and its runner is still alive: a concurrent run in
 *              this workspace, which keeps its child.
 *   'reap'   — it is ours and its runner is gone: an orphan.
 *
 * Only 'reap' leads to a signal, and only to the recorded process group.
 */
export function verdict(entry, observed, root) {
  if (!observed.start) return 'forget'
  if (norm(observed.start) !== norm(entry.start)) return 'forget'
  if (norm(observed.command) !== norm(entry.command)) return 'forget'
  if (!entry.command.includes(`${root}${path.sep}`)) return 'forget'
  if (observed.runnerStart && norm(observed.runnerStart) === norm(entry.runnerStart)) return 'keep'
  return 'reap'
}

/** 128 + signal number, as a shell reports a signalled exit. */
export const signalExitCode = (signal) => 128 + (os.constants.signals[signal] ?? 0)

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

/*
`payload/bin.js` is not in the package's `exports`, so it cannot be resolved
directly. Resolve the package entry from the app's directory — never from this
package's own install — and walk up to the directory that owns it. The result
is a real path inside this workspace, which is what makes the spawned argv
unambiguous: one node process whose command line names this workspace.
*/
export function resolvePayloadBin(fromDir) {
  const require = createRequire(path.join(fromDir, 'package.json'))
  let entry
  try {
    entry = require.resolve('payload')
  } catch {
    throw new Error(`could not resolve 'payload' from ${fromDir} — is it a dependency of this app?`)
  }
  for (let dir = path.dirname(entry); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json')
    if (fs.existsSync(manifest)) {
      const { name, bin } = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      if (name === 'payload') {
        const relative = typeof bin === 'string' ? bin : bin?.payload
        if (relative) return fs.realpathSync(path.join(dir, relative))
        break
      }
    }
    if (path.dirname(dir) === dir) break
  }
  throw new Error(`could not find the payload CLI's bin from ${fromDir}`)
}

/*
One `ps` field for a set of pids, as a map; a pid that is gone is absent. `-ww`
so a long command line is never truncated. Every process is listed and then
filtered, rather than asking for the pids with `-p`: one implausible pid in the
file ("process id too large" on macOS) makes `ps -p` fail for the whole batch,
which would blind the sweep.
*/
async function psField(pids, field) {
  const found = new Map()
  if (!pids.length) return found
  const wanted = new Set(pids)
  let stdout
  try {
    ;({ stdout } = await execFileAsync('ps', ['-A', '-ww', '-o', `pid=,${field}=`], {
      maxBuffer: 64 * 1024 * 1024,
    }))
  } catch (error) {
    stdout = error?.stdout ?? ''
  }
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/)
    if (match && wanted.has(Number(match[1]))) found.set(Number(match[1]), match[2])
  }
  return found
}

const groupAlive = (pgid) => {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

/*
`signal` to the group, then SIGKILL to whatever is left after the grace period.
The wait is on the whole group, not just its leader, so a grandchild that
ignores the first signal is still caught.
*/
async function killGroup(pgid, signal, graceMs) {
  try {
    process.kill(-pgid, signal)
  } catch {
    return // Already gone.
  }
  for (let waited = 0; waited < graceMs; waited += 100) {
    if (!groupAlive(pgid)) return
    await delay(100)
  }
  try {
    process.kill(-pgid, 'SIGKILL')
  } catch {
    // Exited during the grace period.
  }
}

function pidFileStore(root) {
  const file = path.join(root, PID_FILE_NAME)
  const read = () => {
    try {
      return parsePidFile(fs.readFileSync(file, 'utf8'))
    } catch {
      return []
    }
  }
  const write = (entries) => {
    if (!entries.length) fs.rmSync(file, { force: true })
    else fs.writeFileSync(file, serializeEntries(entries))
  }
  return {
    read,
    write,
    append: (entry) => fs.appendFileSync(file, serializeEntries([entry])),
    drop: (pid) => write(read().filter((entry) => entry.pid !== pid)),
  }
}

/** The backstop: reap orphans this workspace recorded. Returns how many. */
export async function sweep(root, graceMs) {
  const store = pidFileStore(root)
  const entries = store.read()
  if (!entries.length) return 0

  const pids = [...new Set(entries.flatMap((entry) => [entry.pid, entry.runnerPid]))]
  const [starts, commands] = await Promise.all([psField(pids, 'lstart'), psField(pids, 'args')])

  const keep = []
  let reaped = 0
  for (const entry of entries) {
    const result = verdict(
      entry,
      {
        start: starts.get(entry.pid),
        command: commands.get(entry.pid),
        runnerStart: starts.get(entry.runnerPid),
      },
      root,
    )
    if (result === 'keep') keep.push(entry)
    if (result !== 'reap') continue
    log(
      `reaping orphaned '${entry.script ?? 'payload'}' (pid ${entry.pid}, started ${entry.at ?? entry.start})`,
    )
    await killGroup(entry.pgid, 'SIGTERM', graceMs)
    reaped += 1
  }
  // Re-read so an entry a concurrent run appended meanwhile is not lost.
  const handled = new Set(entries.map((entry) => entry.pid))
  const kept = new Set(keep.map((entry) => entry.pid))
  store.write(store.read().filter((entry) => !handled.has(entry.pid) || kept.has(entry.pid)))
  return reaped
}

export async function main({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  let parsed, timeoutMs, graceMs, root
  try {
    parsed = parseArgs(argv)
    timeoutMs = selectTimeout(parsed.args, env)
    graceMs = selectGrace(env)
    root = findRoot(cwd)
  } catch (error) {
    log(error.message)
    process.exit(2)
  }

  if (process.platform === 'win32') {
    // No process groups and no `ps`: run it plainly rather than not at all.
    if (parsed.mode === 'reap') return
    const child = spawn(process.execPath, payloadArgv(resolvePayloadBin(cwd), parsed.args), {
      stdio: 'inherit',
      cwd,
    })
    child.on('exit', (code) => process.exit(code ?? 1))
    return
  }

  const reaped = await sweep(root, graceMs)
  if (parsed.mode === 'reap') {
    log(reaped ? `reaped ${reaped} orphaned run(s)` : 'nothing to reap')
    return
  }

  let bin
  try {
    bin = resolvePayloadBin(cwd)
  } catch (error) {
    log(error.message)
    process.exit(1)
  }

  const store = pidFileStore(root)
  const childArgv = payloadArgv(bin, parsed.args)
  const child = spawn(process.execPath, childArgv, { stdio: 'inherit', detached: true, cwd, env })

  let timer
  let finished = false
  let stopping = false
  const finish = (code) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    if (child.pid) store.drop(child.pid)
    process.exit(code)
  }

  /*
  Kill the group and then exit with `code`. Exiting is deliberately left to
  this, not to the child's 'exit' event: the leader usually dies on the first
  signal, and exiting then would abandon the grace period — and with it the
  SIGKILL for a grandchild that ignored that signal.
  */
  const stop = async (signal, code) => {
    if (stopping || finished) return
    stopping = true
    if (child.pid) await killGroup(child.pid, signal, graceMs)
    finish(code)
  }

  child.on('error', (error) => {
    log(error.message)
    if (!stopping) finish(1)
  })
  child.on('exit', async (code, signal) => {
    if (stopping) return
    // Payload is done. Anything it left running in its group goes with it.
    if (groupAlive(child.pid)) {
      stopping = true
      await killGroup(child.pid, 'SIGTERM', graceMs)
    }
    finish(signal ? signalExitCode(signal) : (code ?? 0))
  })

  /*
  The child is in its own group, so a terminal Ctrl-C reaches this runner
  alone. Forwarding the same signal lets Payload clean up as it would have;
  the grace period then escalates to SIGKILL.
  */
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => stop(signal, signalExitCode(signal)))
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      log(
        `no exit after ${Math.round(timeoutMs / 1000)}s — killing process group ${child.pid}. ` +
          'Set PAYLOAD_CLI_TIMEOUT_MS higher, or 0, if this run is legitimately slow.',
      )
      stop('SIGTERM', TIMEOUT_EXIT_CODE)
    }, timeoutMs)
  }

  if (!child.pid) return // Spawn failed; 'error' handles it.

  /*
  Recorded after the spawn, so a run that exits before this lands leaves an
  entry the next sweep forgets on its first condition. The command is the argv
  we spawned, not what `ps` shows this instant — just after fork the child can
  still carry this runner's argv.
  */
  const starts = await psField([child.pid, process.pid], 'lstart')
  if (finished) return
  store.append({
    pid: child.pid,
    pgid: child.pid, // `detached` makes the child its own group leader.
    start: norm(starts.get(child.pid)),
    command: [process.execPath, ...childArgv].join(' '),
    runnerPid: process.pid,
    runnerStart: norm(starts.get(process.pid)),
    script: parsed.args[0] ?? 'payload',
    at: new Date().toISOString(),
  })
}
