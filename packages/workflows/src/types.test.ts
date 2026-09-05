import { describe, expect, it, vi } from 'vitest'
import { failureOptions } from './types.js'

/*
The rename and the default, which are the two things a caller can get wrong.

Audit 06 F-09 (in the consumer): no function config in this repository or that
one used `onFailure`, `concurrency`, `idempotency` or `singleton`, so a run that
exhausted its retries stopped silently. `12` H1 is the bill —
`expire-stale-approvals` threw at 02:00 UTC nightly for eighteen days across
every environment.

`failureOptions` is the one place the option is translated, and it translates two
things: our name to Inngest's, and a factory's own default concurrency to a key
that is either present or absent. Both are the kind of thing that works in the
first call site and silently does not in the fifth.
*/

describe('failureOptions', () => {
  it('renames onTerminalFailure to the key Inngest reads', () => {
    // `onFailure` is Inngest's; `onTerminalFailure` is ours, because
    // `HealthcheckOptions.onFailure` already means something else — once per
    // run with the failed checks, on the first bad run rather than the last.
    const handler = vi.fn()
    expect(failureOptions({ onTerminalFailure: handler })).toEqual({ onFailure: handler })
  })

  it('omits the key entirely when no handler is passed', () => {
    // Not `{ onFailure: undefined }`. `exactOptionalPropertyTypes` is on, and
    // Inngest reads the presence of the key rather than its value.
    expect(Object.keys(failureOptions({}))).toEqual([])
  })

  it('applies a factory default when the host passes nothing', () => {
    // The two read-then-act crons default to 1: they collect a set of due rows
    // and then act on them, and overlapping runs both act on the same row.
    expect(failureOptions({}, 1)).toEqual({ concurrency: 1 })
  })

  it('lets the host override the factory default', () => {
    expect(failureOptions({ concurrency: 4 }, 1)).toEqual({ concurrency: 4 })
  })

  it('honours an explicit cap where the factory has no default', () => {
    expect(failureOptions({ concurrency: 2 })).toEqual({ concurrency: 2 })
  })

  it('does not read 0 as absent', () => {
    // `??` rather than `||`, because a cap of 0 is a request to stop running
    // the function — unusual, and not the same as "no opinion".
    expect(failureOptions({ concurrency: 0 }, 1)).toEqual({ concurrency: 0 })
  })

  it('carries both when both are given', () => {
    const handler = vi.fn()
    expect(failureOptions({ onTerminalFailure: handler, concurrency: 3 }, 1)).toEqual({
      onFailure: handler,
      concurrency: 3,
    })
  })
})
