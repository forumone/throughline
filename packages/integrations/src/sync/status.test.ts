import { describe, expect, it } from 'vitest'
import { createStatusWriter, statusUpdateData } from './status.js'
import { statusFromProblems } from './problems.js'
import type { IntegrationStatusUpdate } from '../types.js'

/** A one-row stand-in for the Integrations collection that merges updates like Payload does. */
function fakePayload(initial: Record<string, unknown>) {
  const row: Record<string, unknown> = { ...initial }
  const calls: Array<{ collection: string; id: string }> = []
  const payload = {
    update: async (args: { collection: string; id: string; data: Record<string, unknown> }) => {
      calls.push({ collection: args.collection, id: args.id })
      Object.assign(row, args.data)
      return row
    },
  }
  return { payload, row, calls }
}

describe('updateStatus', () => {
  it('clears lastError on success', async () => {
    const { payload, row, calls } = fakePayload({ lastError: 'HTTP 500', lastSyncStatus: 'failed' })
    await createStatusWriter(payload as never, 'integrations')('inst-1', 'success')

    expect(calls).toEqual([{ collection: 'integrations', id: 'inst-1' }])
    expect(row['lastSyncStatus']).toBe('success')
    expect(row['lastError']).toBeNull()
    expect(typeof row['lastSyncAt']).toBe('string')
  })

  it('writes the message of a partial run', async () => {
    const { payload, row } = fakePayload({ lastError: null, lastSyncStatus: 'success' })
    await createStatusWriter(payload as never, 'integrations')(
      'inst-1',
      'partial',
      'event 4: no name',
    )

    expect(row['lastSyncStatus']).toBe('partial')
    expect(row['lastError']).toBe('event 4: no name')
  })

  it('writes the message of a failed run', async () => {
    const { payload, row } = fakePayload({ lastError: 'older reason' })
    await createStatusWriter(payload as never, 'integrations')('inst-1', 'failed', 'HTTP 502')

    expect(row['lastError']).toBe('HTTP 502')
  })

  it('leaves lastError alone when a partial run reaches it with no message', async () => {
    // The types refuse this; an untyped caller can still send it.
    const untyped = ['partial'] as unknown as IntegrationStatusUpdate
    const { payload, row } = fakePayload({
      lastError: 'form abc: no fields',
      lastSyncStatus: 'partial',
    })
    await createStatusWriter(payload as never, 'integrations')('inst-1', ...untyped)

    expect(row['lastSyncStatus']).toBe('partial')
    expect(row['lastError']).toBe('form abc: no fields')
  })

  it('accepts the arguments statusFromProblems builds', async () => {
    const { payload, row } = fakePayload({ lastError: null })
    await createStatusWriter(payload as never, 'integrations')(
      'inst-1',
      ...statusFromProblems(['job 7: no title']),
    )
    expect(row['lastSyncStatus']).toBe('partial')
    expect(row['lastError']).toBe('job 7: no title')
  })

  it('does not write an empty message over the previous one', () => {
    expect(statusUpdateData('failed', '')).not.toHaveProperty('lastError')
  })

  it('requires a message for non-success statuses at the type level', () => {
    const write = createStatusWriter(fakePayload({}).payload as never, 'integrations')
    // @ts-expect-error -- partial needs a message
    void write('inst-1', 'partial')
    // @ts-expect-error -- failed needs a message
    void write('inst-1', 'failed')
    // @ts-expect-error -- success takes none
    void write('inst-1', 'success', 'all good')
    // @ts-expect-error -- a run that reports its status has run
    void write('inst-1', 'never-run')
    const maybe = undefined as string | undefined
    // @ts-expect-error -- a possibly-missing message is not enough
    void write('inst-1', 'partial', maybe)
  })
})
