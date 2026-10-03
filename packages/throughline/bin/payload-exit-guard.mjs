/*
Preloaded into the Payload CLI by `payload-cli.mjs` (`node --import`), to turn
one silent failure into a loud one.

Every Payload command that finishes calls `process.exit` — `0` once the work is
done, `1` on an error. Intermittently the config's dynamic `import()` never
settles instead (payloadcms/payload#17757): nothing is left on the event loop,
so Node exits by itself, with status 0, having printed nothing and done
nothing. A `migrate` that does that reports success over an unmigrated
database; a `generate:*` reports success over a stale file.

So a natural exit with status 0 is not success here: it is this. This module
records whether `process.exit` was called, and if it was not, replaces the 0
with NO_COMPLETION_EXIT_CODE. Any other status — a non-zero code, an uncaught
error, a signal — is left exactly as it was.
*/

/** EX_SOFTWARE in sysexits.h: an internal error, not a usage or data error. */
export const NO_COMPLETION_EXIT_CODE = 70

let called = false
const exit = process.exit.bind(process)
process.exit = (code) => {
  called = true
  return exit(code)
}

process.on('exit', (code) => {
  if (called || code !== 0) return
  process.stderr.write(
    'throughline-payload: the Payload CLI exited without finishing — it never ' +
      'called process.exit, so the command did not run (payloadcms/payload#17757). ' +
      'Run it again.\n',
  )
  process.exitCode = NO_COMPLETION_EXIT_CODE
})
