import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_TIMEOUT_MS,
  PID_FILE_NAME,
  TIMEOUT_EXIT_CODE,
  findRoot,
  isMigrateCommand,
  parseArgs,
  parsePidFile,
  selectTimeout,
  serializeEntries,
  verdict,
  type PidEntry,
} from './payload-cli.mjs'

const BIN = fileURLToPath(new URL('./throughline-payload.mjs', import.meta.url))

describe('parseArgs', () => {
  it('treats a leading --reap as sweep-only', () => {
    expect(parseArgs(['--reap'])).toEqual({ mode: 'reap', args: [] })
  })

  it('passes everything else to Payload untouched', () => {
    expect(parseArgs(['generate:types', '--reap'])).toEqual({
      mode: 'run',
      args: ['generate:types', '--reap'],
    })
    expect(parseArgs([])).toEqual({ mode: 'run', args: [] })
  })
})

describe('selectTimeout', () => {
  it('defaults to five minutes', () => {
    expect(selectTimeout(['generate:types'], {})).toBe(DEFAULT_TIMEOUT_MS)
    expect(selectTimeout([], {})).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('gives the migrate family no wall clock by default', () => {
    for (const command of ['migrate', 'migrate:create', 'migrate:status', 'migrate:fresh']) {
      expect(isMigrateCommand([command])).toBe(true)
      expect(selectTimeout([command], {})).toBe(0)
    }
    expect(isMigrateCommand(['migrated'])).toBe(false)
    expect(isMigrateCommand(['generate:types', 'migrate'])).toBe(false)
  })

  it('lets PAYLOAD_CLI_TIMEOUT_MS win, for migrate too', () => {
    expect(selectTimeout(['generate:types'], { PAYLOAD_CLI_TIMEOUT_MS: '0' })).toBe(0)
    expect(selectTimeout(['migrate'], { PAYLOAD_CLI_TIMEOUT_MS: '60000' })).toBe(60_000)
    expect(selectTimeout(['migrate'], { PAYLOAD_CLI_TIMEOUT_MS: '' })).toBe(0)
  })

  it('rejects a malformed value rather than silently running unbounded', () => {
    for (const value of ['abc', '-1', '1.5', '5m']) {
      expect(() => selectTimeout([], { PAYLOAD_CLI_TIMEOUT_MS: value })).toThrow(
        /PAYLOAD_CLI_TIMEOUT_MS/,
      )
    }
  })
})

describe('findRoot', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'throughline-root-')))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('walks up to the pnpm workspace root', () => {
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), '')
    fs.writeFileSync(path.join(dir, 'package.json'), '{}')
    const app = path.join(dir, 'apps/web')
    fs.mkdirSync(app, { recursive: true })
    fs.writeFileSync(path.join(app, 'package.json'), '{}')
    expect(findRoot(app)).toBe(dir)
  })

  it('falls back to the nearest package outside a pnpm workspace', () => {
    const app = path.join(dir, 'site')
    fs.mkdirSync(path.join(app, 'src'), { recursive: true })
    fs.writeFileSync(path.join(app, 'package.json'), '{}')
    expect(
      findRoot(path.join(app, 'src'), (file) => file.startsWith(dir) && fs.existsSync(file)),
    ).toBe(app)
  })
})

const ROOT = '/work/site'
const entry: PidEntry = {
  pid: 4242,
  pgid: 4242,
  start: 'Wed Sep 30 10:00:00 2026',
  command: `/usr/bin/node ${ROOT}/node_modules/.pnpm/payload@3/node_modules/payload/bin.js generate:types`,
  runnerPid: 4241,
  runnerStart: 'Wed Sep 30 09:59:59 2026',
}

describe('parsePidFile', () => {
  it('round-trips entries', () => {
    expect(parsePidFile(serializeEntries([entry, { ...entry, pid: 7, pgid: 7 }]))).toEqual([
      entry,
      { ...entry, pid: 7, pgid: 7 },
    ])
  })

  it('drops torn lines, incomplete entries and anything that is not a group leader', () => {
    const { command: _command, ...noCommand } = entry
    const text = [
      JSON.stringify(entry),
      '{"pid": 12, "pg',
      JSON.stringify(noCommand),
      JSON.stringify({ ...entry, pgid: 1 }),
      JSON.stringify({ ...entry, pid: 1, pgid: 1 }),
      JSON.stringify({ ...entry, pid: '4242' }),
      'null',
      '',
    ].join('\n')
    expect(parsePidFile(text)).toEqual([entry])
  })
})

describe('verdict', () => {
  const observed = {
    start: ` ${entry.start}`,
    command: entry.command,
    runnerStart: undefined,
  }

  it('reaps a recorded child whose runner is gone', () => {
    expect(verdict(entry, observed, ROOT)).toBe('reap')
  })

  it('reaps when the runner pid was recycled for something else', () => {
    expect(verdict(entry, { ...observed, runnerStart: 'Thu Oct  1 00:00:00 2026' }, ROOT)).toBe(
      'reap',
    )
  })

  it('keeps a child whose runner is still alive', () => {
    expect(verdict(entry, { ...observed, runnerStart: entry.runnerStart }, ROOT)).toBe('keep')
  })

  it('forgets a pid that is gone', () => {
    expect(
      verdict(entry, { start: undefined, command: undefined, runnerStart: undefined }, ROOT),
    ).toBe('forget')
  })

  it('forgets a recycled pid: same number, different start time', () => {
    expect(verdict(entry, { ...observed, start: 'Thu Oct  1 00:00:00 2026' }, ROOT)).toBe('forget')
  })

  it('forgets a pid whose command line is not the one recorded', () => {
    expect(
      verdict(
        entry,
        { ...observed, command: '/usr/bin/node /elsewhere/payload/bin.js generate:types' },
        ROOT,
      ),
    ).toBe('forget')
  })

  it("forgets an entry that is not rooted in this workspace — another repo's orphan included", () => {
    expect(verdict(entry, observed, '/work/other-site')).toBe('forget')
    expect(verdict(entry, observed, '/work/sit')).toBe('forget')
  })
})

// ---------------------------------------------------------------------------
// Real processes, against a fake `payload` that hangs.
// ---------------------------------------------------------------------------

/*
The fake CLI starts a grandchild (same process group) that ignores SIGTERM, so
a pass proves the whole group dies and that SIGKILL escalation works. Both pids
are written to `pids` once they are up.
*/
const FAKE_BIN = `
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' })
fs.writeFileSync(process.env.FAKE_PIDS + '.tmp', JSON.stringify([process.pid, grandchild.pid]))
fs.renameSync(process.env.FAKE_PIDS + '.tmp', process.env.FAKE_PIDS)
if (process.env.FAKE_EXIT) setTimeout(() => process.exit(Number(process.env.FAKE_EXIT)), 500)
else setInterval(() => {}, 1000)
`

function makeWorkspace(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'throughline-payload-')))
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), "packages: ['apps/*']\n")
  fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}')
  const app = path.join(dir, 'apps/web')
  fs.mkdirSync(app, { recursive: true })
  fs.writeFileSync(path.join(app, 'package.json'), '{"name":"web","private":true}')
  const payload = path.join(app, 'node_modules/payload')
  fs.mkdirSync(payload, { recursive: true })
  fs.writeFileSync(
    path.join(payload, 'package.json'),
    JSON.stringify({ name: 'payload', main: 'index.js', bin: { payload: 'bin.js' } }),
  )
  fs.writeFileSync(path.join(payload, 'index.js'), 'module.exports = {}\n')
  fs.writeFileSync(path.join(payload, 'bin.js'), FAKE_BIN)
  return dir
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until<T>(read: () => T | undefined, ms = 15_000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** Every live process whose command line mentions `dir`. */
function processesUnder(dir: string): string[] {
  const out = execFileSync('ps', ['-Aww', '-o', 'pid=,args='], { encoding: 'utf8' })
  return out.split('\n').filter((line) => line.includes(dir))
}

describe('the runner, against a hanging CLI', () => {
  let workspace: string
  let app: string
  let pidsFile: string
  const spawned: ChildProcess[] = []
  const started = new Set<number>()

  beforeEach(() => {
    workspace = makeWorkspace()
    app = path.join(workspace, 'apps/web')
    pidsFile = path.join(workspace, 'fake-pids.json')
  })

  afterEach(() => {
    // Only processes this test started itself: by pid, or by the group its own
    // workspace recorded — so a failed assertion cannot leave an orphan behind.
    for (const child of spawned.splice(0)) if (child.pid && alive(child.pid)) child.kill('SIGKILL')
    try {
      for (const pid of JSON.parse(fs.readFileSync(pidsFile, 'utf8')) as number[]) started.add(pid)
    } catch {
      // Never written.
    }
    try {
      for (const entry of parsePidFile(
        fs.readFileSync(path.join(workspace, PID_FILE_NAME), 'utf8'),
      )) {
        if (entry.command.includes(workspace)) started.add(-entry.pgid)
      }
    } catch {
      // No pid file.
    }
    for (const pid of started) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    started.clear()
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  function run(args: string[], env: Record<string, string> = {}) {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: app,
      env: { ...process.env, FAKE_PIDS: pidsFile, PAYLOAD_CLI_GRACE_MS: '300', ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    spawned.push(child)
    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const exited = new Promise<number | null>((resolve) =>
      child.on('exit', (code) => resolve(code)),
    )
    return { child, exited, stderr: () => stderr }
  }

  async function fakePids(): Promise<number[]> {
    const pids = await until(() =>
      fs.existsSync(pidsFile)
        ? (JSON.parse(fs.readFileSync(pidsFile, 'utf8')) as number[])
        : undefined,
    )
    for (const pid of pids) started.add(pid)
    return pids
  }

  it('kills the whole group on the wall clock, and exits 124', async () => {
    const { exited, stderr } = run(['generate:types'], { PAYLOAD_CLI_TIMEOUT_MS: '6000' })
    const pids = await fakePids()
    expect(pids.every(alive)).toBe(true)

    expect(await exited).toBe(TIMEOUT_EXIT_CODE)
    expect(stderr()).toMatch(/no exit after/)
    await until(() => (pids.some(alive) ? undefined : true), 3_000)
    expect(fs.existsSync(path.join(workspace, PID_FILE_NAME))).toBe(false)
    expect(processesUnder(workspace)).toEqual([])
  }, 30_000)

  it('kills the whole group when the runner gets SIGTERM, and exits 143', async () => {
    const { child, exited } = run(['generate:types'], { PAYLOAD_CLI_TIMEOUT_MS: '0' })
    const pids = await fakePids()
    // The entry is appended just after the spawn; wait for it so SIGTERM lands on a fully started run.
    await until(() => (fs.existsSync(path.join(workspace, PID_FILE_NAME)) ? true : undefined))

    child.kill('SIGTERM')
    expect(await exited).toBe(143)
    await until(() => (pids.some(alive) ? undefined : true), 3_000)
    expect(fs.existsSync(path.join(workspace, PID_FILE_NAME))).toBe(false)
    expect(processesUnder(workspace)).toEqual([])
  }, 30_000)

  it('passes through the exit code, and takes down anything Payload left in its group', async () => {
    const { exited } = run(['generate:types'], { FAKE_EXIT: '3' })
    const pids = await fakePids()
    expect(await exited).toBe(3)
    await until(() => (pids.some(alive) ? undefined : true), 3_000)
    expect(fs.existsSync(path.join(workspace, PID_FILE_NAME))).toBe(false)
    expect(processesUnder(workspace)).toEqual([])
  }, 30_000)

  it('reaps a run whose runner was SIGKILLed, and nothing it did not record', async () => {
    // An unrelated process outside the workspace, planted in the pid file with
    // its real pid and start time. The reaper must leave it alone.
    const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    })
    spawned.push(bystander)

    const { child, exited } = run(['generate:types'], { PAYLOAD_CLI_TIMEOUT_MS: '0' })
    const pids = await fakePids()
    const pidFile = path.join(workspace, PID_FILE_NAME)
    await until(() => (fs.existsSync(pidFile) ? true : undefined))

    child.kill('SIGKILL') // No handler of the runner's can run.
    await exited
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(pids.every(alive)).toBe(true) // Orphaned, exactly the failure being fixed.

    const start = execFileSync('ps', ['-o', 'lstart=', '-p', String(bystander.pid)], {
      encoding: 'utf8',
    })
    fs.appendFileSync(
      pidFile,
      serializeEntries([
        {
          pid: bystander.pid!,
          pgid: bystander.pid!,
          start: start.trim(),
          command: `${process.execPath} -e setInterval(() => {}, 1000)`,
          runnerPid: 999_999, // Implausible on purpose: one bad pid must not blind the sweep.
          runnerStart: '',
        },
      ]),
    )

    const reap = run(['--reap'])
    expect(await reap.exited).toBe(0)
    expect(reap.stderr()).toMatch(/reaped 1 orphaned run/)
    await until(() => (pids.some(alive) ? undefined : true), 3_000)
    expect(alive(bystander.pid!)).toBe(true)
    expect(fs.existsSync(pidFile)).toBe(false)
    expect(processesUnder(workspace)).toEqual([])
  }, 30_000)
})
