import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeSyncOutcome,
  fetchSyncStatus,
  formatSyncTime,
  syncHasFinished,
  triggerSync,
  type SyncStatus,
} from './sync-client.js'

const args = {
  serverURL: 'https://example.test',
  apiRoute: '/api',
  collectionSlug: 'integrations',
  id: 'inst-1',
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('triggerSync', () => {
  it('POSTs to the collection endpoint with the session cookie', async () => {
    const spy = stubFetch(() => jsonResponse({ ok: true, lastSyncAt: null }, 202))
    const result = await triggerSync(args)

    expect(spy).toHaveBeenCalledWith(
      'https://example.test/api/integrations/inst-1/sync',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(result).toMatchObject({ ok: true })
  })

  it('sends a reason only when one is given', async () => {
    const spy = stubFetch(() => jsonResponse({ ok: true }, 202))
    await triggerSync(args)
    expect(spy.mock.calls[0]?.[1]?.body).toBe('{}')

    await triggerSync({ ...args, reason: 'why' })
    expect(spy.mock.calls[1]?.[1]?.body).toBe('{"reason":"why"}')
  })

  // Every refusal has to surface. A button that appears to work when nothing
  // was queued is the failure this whole path exists to avoid.
  it("surfaces the server's reason for a refusal", async () => {
    stubFetch(() => jsonResponse({ error: 'Integration "X" is disabled.' }, 409))
    const result = await triggerSync(args)
    expect(result).toEqual({ ok: false, message: 'Integration "X" is disabled.' })
  })

  it('reports an unreachable server rather than throwing', async () => {
    stubFetch(() => Promise.reject(new Error('offline')))
    const result = await triggerSync(args)
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.message).toMatch(/Could not reach the server/)
  })

  it('reports the status code when the body is not JSON', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 502 }))
    const result = await triggerSync(args)
    expect(result).toEqual({ ok: false, message: 'The server returned 502.' })
  })
})

describe('fetchSyncStatus', () => {
  it('reads the three status fields', async () => {
    stubFetch(() =>
      jsonResponse({
        lastSyncAt: '2026-08-29T11:00:00.000Z',
        lastSyncStatus: 'failed',
        lastError: 'token missing the forms scope',
      }),
    )
    await expect(fetchSyncStatus(args)).resolves.toEqual({
      lastSyncAt: '2026-08-29T11:00:00.000Z',
      lastSyncStatus: 'failed',
      lastError: 'token missing the forms scope',
    })
  })

  it('drops a status value the collection does not define', async () => {
    stubFetch(() => jsonResponse({ lastSyncAt: 'x', lastSyncStatus: 'weird' }))
    await expect(fetchSyncStatus(args)).resolves.toMatchObject({ lastSyncStatus: null })
  })

  // Called on a timer: one missed poll is not worth telling anyone about.
  it('returns null on a failed request', async () => {
    stubFetch(() => Promise.reject(new Error('offline')))
    await expect(fetchSyncStatus(args)).resolves.toBeNull()
    stubFetch(() => jsonResponse({}, 403))
    await expect(fetchSyncStatus(args)).resolves.toBeNull()
  })
})

describe('syncHasFinished', () => {
  const at = (lastSyncAt: null | string): SyncStatus => ({
    lastSyncAt,
    lastSyncStatus: 'success',
    lastError: null,
  })

  it('is false while lastSyncAt still matches the baseline', () => {
    expect(syncHasFinished('2026-08-29T10:00:00.000Z', at('2026-08-29T10:00:00.000Z'))).toBe(false)
  })

  it('is true once lastSyncAt moves', () => {
    expect(syncHasFinished('2026-08-29T10:00:00.000Z', at('2026-08-29T10:05:00.000Z'))).toBe(true)
  })

  it('is true on the first run of an instance that had never synced', () => {
    expect(syncHasFinished(null, at('2026-08-29T10:05:00.000Z'))).toBe(true)
  })

  it('is false when the instance still has no run, or the poll failed', () => {
    expect(syncHasFinished(null, at(null))).toBe(false)
    expect(syncHasFinished(null, null)).toBe(false)
  })
})

describe('describeSyncOutcome', () => {
  const status = (over: Partial<SyncStatus>): SyncStatus => ({
    lastSyncAt: '2026-08-29T10:05:00.000Z',
    lastSyncStatus: 'success',
    lastError: null,
    ...over,
  })

  it('names the instance', () => {
    expect(describeSyncOutcome(status({}), 'Greenhouse').title).toBe('"Greenhouse" synced.')
    expect(describeSyncOutcome(status({})).title).toBe('The integration synced.')
  })

  // Partial is not a success: some of what was asked for did not happen, and
  // finding out whether a change landed is the reason the button was pressed.
  it('treats partial as a warning and carries the error text', () => {
    expect(
      describeSyncOutcome(status({ lastSyncStatus: 'partial', lastError: '3 of 40' })),
    ).toEqual({
      severity: 'warning',
      title: 'The integration synced, with problems.',
      description: '3 of 40',
    })
  })

  it('treats failed as an error', () => {
    expect(describeSyncOutcome(status({ lastSyncStatus: 'failed' })).severity).toBe('error')
  })

  it('says so when a run left no status at all', () => {
    const described = describeSyncOutcome(status({ lastSyncStatus: null }))
    expect(described.severity).toBe('warning')
    expect(described.title).toMatch(/reported no status/)
  })
})

describe('formatSyncTime', () => {
  it('reads Never for an instance that has not run', () => {
    expect(formatSyncTime(null)).toBe('Never')
  })

  it('does not present garbage as a date', () => {
    expect(formatSyncTime('not a date')).toBe('Unknown')
  })
})
