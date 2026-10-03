// Types for the tests. The runner itself is plain ESM so it runs without a
// build step; this file is not published.

export interface PidEntry {
  pid: number
  pgid: number
  start: string
  command: string
  runnerPid: number
  runnerStart: string
  script?: string
  at?: string
}

export interface Observed {
  start: string | undefined
  command: string | undefined
  runnerStart: string | undefined
}

export const PID_FILE_NAME: string
export const DEFAULT_TIMEOUT_MS: number
export const DEFAULT_GRACE_MS: number
export const TIMEOUT_EXIT_CODE: number
export const EXIT_GUARD: string

export function payloadArgv(bin: string, args: readonly string[]): string[]

export function norm(value: string | undefined): string
export function parseArgs(argv: readonly string[]): { mode: 'reap' | 'run'; args: string[] }
export function isMigrateCommand(args: readonly string[]): boolean
export function selectTimeout(
  args: readonly string[],
  env: Record<string, string | undefined>,
): number
export function selectGrace(env: Record<string, string | undefined>): number
export function findRoot(cwd: string, exists?: (file: string) => boolean): string
export function parsePidFile(text: string): PidEntry[]
export function serializeEntries(entries: readonly PidEntry[]): string
export function verdict(
  entry: PidEntry,
  observed: Observed,
  root: string,
): 'forget' | 'keep' | 'reap'
export function signalExitCode(signal: string): number
export function resolvePayloadBin(fromDir: string): string
export function sweep(root: string, graceMs: number): Promise<number>
export function main(options?: {
  argv?: string[]
  cwd?: string
  env?: Record<string, string | undefined>
}): Promise<void>
