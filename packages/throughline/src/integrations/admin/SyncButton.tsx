'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, FieldLabel, toast, useAuth, useConfig, useDocumentInfo } from '@payloadcms/ui'
import {
  describeSyncOutcome,
  fetchSyncStatus,
  formatSyncTime,
  syncHasFinished,
  triggerSync,
  type SyncStatus,
} from './sync-client.js'

export interface ThroughlineSyncButtonProps {
  /** Slug the integrations collection is mounted at. Injected via `clientProps`. */
  collectionSlug?: string
}

/** How long to watch for the run to finish before saying so and stopping. */
const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 120_000

type Phase = 'idle' | 'triggering' | 'waiting'

/**
 * "Sync now", in the sidebar beside the status fields it moves.
 *
 * Everything behind this button already existed — the `integration/manual-sync`
 * event, a handler on every integration, the status fields, the audit rows —
 * and reaching it meant an MCP round trip with a minted API key or a hand-sent
 * event in the Inngest dashboard. Neither is available to the person who has
 * just fixed a job posting and wants to see it on the site before the next
 * hourly cron.
 *
 * It fires an event; it does not wait for the sync. So the button says the run
 * was *queued*, then watches `lastSyncAt` for the two minutes a sync normally
 * takes and reports the outcome when it moves. Stopping watching is not the
 * same as failing, and the copy says so — the run continues either way.
 *
 * The form is deliberately untouched. Writing the new status into form state
 * would put server values into a document the editor may not have saved, so
 * the result is rendered here instead and the sidebar fields catch up on the
 * next load.
 */
export function SyncButton(props: ThroughlineSyncButtonProps = {}): React.ReactNode {
  const collectionSlug = props.collectionSlug ?? 'integrations'

  const { id, data } = useDocumentInfo()
  const { config } = useConfig()
  const { user } = useAuth()

  const [phase, setPhase] = useState<Phase>('idle')
  const [baseline, setBaseline] = useState<null | string>(null)
  const [outcome, setOutcome] = useState<null | SyncStatus>(null)
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false)

  const { api } = config.routes
  const serverURL = config.serverURL ?? ''
  const instanceName = typeof data?.['name'] === 'string' ? data['name'] : undefined
  const enabled = data?.['enabled'] === true

  const roles = (user as null | Record<string, unknown>)?.['roles']
  const isAdmin = Array.isArray(roles) && roles.includes('admin')

  // Read inside the poll effect, which must not restart every time the name
  // changes — a restarted effect is a restarted timeout.
  const instanceNameRef = useRef(instanceName)
  instanceNameRef.current = instanceName

  const start = useCallback(async () => {
    if (id === undefined || id === null || phase !== 'idle') return

    setPhase('triggering')
    setOutcome(null)
    setGaveUpWaiting(false)

    const result = await triggerSync({ serverURL, apiRoute: api, collectionSlug, id })

    if (!result.ok) {
      toast.error(result.message)
      setPhase('idle')
      return
    }

    toast.success(result.body.message ?? 'Sync queued.')
    setBaseline(result.body.lastSyncAt ?? null)
    setPhase('waiting')
  }, [api, collectionSlug, id, phase, serverURL])

  useEffect(() => {
    if (phase !== 'waiting' || id === undefined || id === null) return

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = Date.now() + POLL_TIMEOUT_MS

    const poll = async (): Promise<void> => {
      const status = await fetchSyncStatus({
        serverURL,
        apiRoute: api,
        collectionSlug,
        id,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      if (status && syncHasFinished(baseline, status)) {
        setOutcome(status)
        setPhase('idle')
        const described = describeSyncOutcome(status, instanceNameRef.current)
        const options = described.description ? { description: described.description } : {}
        if (described.severity === 'success') toast.success(described.title, options)
        else if (described.severity === 'warning') toast.warning(described.title, options)
        else toast.error(described.title, { ...options, duration: 10_000 })
        return
      }

      if (Date.now() >= deadline) {
        setGaveUpWaiting(true)
        setPhase('idle')
        return
      }

      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
    }

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [api, baseline, collectionSlug, id, phase, serverURL])

  // Create view: no instance to sync, and no id to sync it by.
  if (id === undefined || id === null) return null
  // The endpoint refuses a non-admin anyway; not rendering the control is how
  // an editor finds that out without pressing it.
  if (!isAdmin) return null

  const label = phase === 'idle' ? 'Sync now' : phase === 'triggering' ? 'Queueing…' : 'Syncing…'

  return (
    <div className="field-type throughline-integration-sync">
      {/* `as="span"`: a <label> with no control to point at is not a label. */}
      <FieldLabel as="span" label="Manual sync" />
      <Button
        buttonStyle="secondary"
        disabled={!enabled || phase !== 'idle'}
        onClick={() => {
          void start()
        }}
        size="small"
        type="button"
        {...(enabled ? {} : { tooltip: 'Enable this integration first.' })}
      >
        {label}
      </Button>
      {/* Announced, because the button's own label stops changing once the
          event is queued and the rest of the story happens here. */}
      <p aria-live="polite" className="field-description">
        {state({ enabled, gaveUpWaiting, outcome, phase })}
      </p>
    </div>
  )
}

/** The line under the button. Pure, so the copy can be read in one place. */
function state(args: {
  enabled: boolean
  gaveUpWaiting: boolean
  outcome: null | SyncStatus
  phase: Phase
}): string {
  if (!args.enabled) return 'Disabled integrations cannot be synced. Enable and save first.'
  if (args.phase === 'triggering') return 'Asking the queue to run this integration…'
  if (args.phase === 'waiting') return 'Queued. Watching for the run to finish.'
  if (args.gaveUpWaiting) {
    return 'Still running after two minutes. It has not failed — reload to see the result.'
  }
  if (args.outcome) return `Finished at ${formatSyncTime(args.outcome.lastSyncAt)}.`
  return 'Runs this integration now, instead of waiting for its schedule.'
}
