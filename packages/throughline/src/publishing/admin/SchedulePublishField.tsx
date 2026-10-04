'use client'

import React, { useCallback, useState } from 'react'
import {
  Button,
  DatePicker,
  FieldLabel,
  toast,
  useConfig,
  useDocumentInfo,
  useField,
  useForm,
  useFormModified,
} from '@payloadcms/ui'
import { disarmFirstError, goToFirstError } from './first-error.js'
import {
  SHOW_ME,
  blockToastId,
  callPublishingEndpoint,
  describeBlock,
  fieldErrorsFromBlock,
} from './publishing-client.js'
import { formatScheduledTime, scheduleState, unscheduleOutcome } from './schedule-state.js'

export interface ThroughlineSchedulePublishFieldProps {
  /** The field's form path. Supplied by Payload. */
  path: string
  /** Route prefix the plugin is mounted under. Injected via `clientProps`. */
  routePrefix?: string
}

/**
 * The Schedule control, rendered in place of the scheduled-publish date field.
 *
 * The field is not typed into directly. Scheduling goes through the publishing
 * server so the pipeline's checks run *now* — an editor hears about a missing
 * alt text while the page is in front of them, rather than from a log line on
 * the morning it was meant to go out. The same checks run again when the
 * schedule fires; this is the early warning, not the gate.
 *
 * The server writes the time with a draft save, and the control then puts the
 * same value into form state without marking the form modified. That keeps the
 * two in step: the next Save Draft sends the value the server already holds,
 * rather than the empty one the form loaded with, which would silently cancel
 * the schedule.
 */
export function SchedulePublishField(props: ThroughlineSchedulePublishFieldProps): React.ReactNode {
  const routePrefix = props.routePrefix ?? '/publishing'
  const { value, setValue } = useField<string | null>({ path: props.path })
  const { collectionSlug, hasPublishPermission, id, incrementVersionCount } = useDocumentInfo()
  const { config } = useConfig()
  const { dispatchFields, getFields, setIsValid, setSubmitted, submit } = useForm()
  const modified = useFormModified()
  const [chosen, setChosen] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)

  const { api } = config.routes
  const serverURL = config.serverURL ?? ''
  const state = scheduleState(value, Date.now())

  const schedule = useCallback(async () => {
    if (id === undefined || id === null || !collectionSlug || !chosen || busy) return
    setBusy(true)
    try {
      // Pending edits are saved first, as a draft, for the same reason the
      // Publish button does it: the checks evaluate what is saved, and the
      // scheduled publish will promote what is saved.
      if (modified) {
        const saved = await submit({
          action: `${serverURL}${api}/${collectionSlug}/${id}?draft=true&depth=0`,
          method: 'PATCH',
          overrides: { _status: 'draft' },
          skipValidation: true,
          disableSuccessStatus: true,
        })
        if (!saved || !saved.res.ok) return
      }

      const result = await callPublishingEndpoint({
        serverURL,
        apiRoute: api,
        routePrefix,
        action: 'schedule',
        collection: collectionSlug,
        id,
        publishAt: chosen.toISOString(),
      })

      // Errors stay until closed, one per document (forumone-2026#805).
      const toastId = blockToastId('schedule', collectionSlug, id)

      if (!result.ok) {
        toast.error(result.message, { id: toastId, duration: Infinity })
        return
      }

      if (!result.body.scheduled || !result.body.scheduledFor) {
        // A block renders the same way a blocked publish does: on the fields
        // it names, and in full in the toast.
        const fieldErrors = fieldErrorsFromBlock(result.body, Object.keys(getFields()))
        if (fieldErrors.length > 0) {
          dispatchFields({ type: 'ADD_SERVER_ERRORS', errors: fieldErrors })
          setIsValid(false)
          setSubmitted(true)
          disarmFirstError()
          void goToFirstError()
        }
        const { title, description } = describeBlock(result.body, {
          markedFields: fieldErrors.length,
        })
        toast.error(`Not scheduled. ${title}`, {
          id: toastId,
          ...(description ? { description } : {}),
          duration: Infinity,
          ...(fieldErrors.length > 0 ? { action: SHOW_ME } : {}),
        })
        return
      }

      toast.dismiss(toastId)
      setValue(result.body.scheduledFor, true)
      setChosen(null)
      incrementVersionCount()

      const heading = `Scheduled for ${formatScheduledTime(new Date(result.body.scheduledFor))}`
      const warnings = result.body.warnings ?? []
      if (warnings.length > 0) {
        toast.warning(heading, { description: warnings.join('\n'), duration: 10_000 })
      } else {
        toast.success(heading)
      }
    } finally {
      setBusy(false)
    }
  }, [
    api,
    busy,
    chosen,
    collectionSlug,
    dispatchFields,
    getFields,
    id,
    incrementVersionCount,
    modified,
    routePrefix,
    serverURL,
    setIsValid,
    setSubmitted,
    setValue,
    submit,
  ])

  const cancel = useCallback(async () => {
    if (id === undefined || id === null || !collectionSlug || busy) return
    setBusy(true)
    try {
      const result = await callPublishingEndpoint({
        serverURL,
        apiRoute: api,
        routePrefix,
        action: 'unschedule',
        collection: collectionSlug,
        id,
      })
      const toastId = blockToastId('unschedule', collectionSlug, id)
      if (!result.ok) {
        toast.error(result.message, { id: toastId, duration: Infinity })
        return
      }
      const outcome = unscheduleOutcome(result.body)
      if (outcome.clear) setValue(null, true)
      if (result.body.unscheduled) incrementVersionCount()
      if (outcome.kind === 'error') toast.error(outcome.message, { id: toastId, duration: Infinity })
      else if (outcome.kind === 'info') toast.info(outcome.message, { id: toastId })
      else toast.success(outcome.message, { id: toastId })
    } finally {
      setBusy(false)
    }
  }, [api, busy, collectionSlug, id, incrementVersionCount, routePrefix, serverURL, setValue])

  return (
    <div className="field-type" style={{ marginBottom: 'var(--spacing-field, 1.5rem)' }}>
      <FieldLabel label="Scheduled publish" path={props.path} />
      <Body
        canSchedule={Boolean(hasPublishPermission)}
        hasDocument={id !== undefined && id !== null}
        state={state}
        busy={busy}
        chosen={chosen}
        onChoose={setChosen}
        onSchedule={() => void schedule()}
        onCancel={() => void cancel()}
      />
    </div>
  )
}

function Body(props: {
  canSchedule: boolean
  hasDocument: boolean
  state: ReturnType<typeof scheduleState>
  busy: boolean
  chosen: Date | null
  onChoose: (date: Date | null) => void
  onSchedule: () => void
  onCancel: () => void
}): React.ReactNode {
  const { state } = props

  if (state.kind !== 'none') {
    return (
      <>
        <p style={{ margin: '0 0 0.5rem' }}>
          {state.kind === 'upcoming'
            ? `Publishes automatically ${state.label}.`
            : `This was due to publish ${state.label} but hasn't. Click Publish to see what's stopping it.`}
        </p>
        {props.canSchedule ? (
          <Button
            buttonStyle="secondary"
            size="small"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel schedule
          </Button>
        ) : null}
      </>
    )
  }

  if (!props.hasDocument) {
    return <p style={{ margin: 0 }}>Save a draft first, then schedule it.</p>
  }

  if (!props.canSchedule) {
    return <p style={{ margin: 0 }}>You don&apos;t have permission to schedule publishing.</p>
  }

  return (
    <>
      <DatePicker
        pickerAppearance="dayAndTime"
        minDate={new Date()}
        timeIntervals={15}
        {...(props.chosen ? { value: props.chosen } : {})}
        onChange={(date) => props.onChoose(date ?? null)}
        readOnly={props.busy}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <Button
          buttonStyle="secondary"
          size="small"
          disabled={!props.chosen || props.busy}
          onClick={props.onSchedule}
        >
          {props.busy ? 'Scheduling…' : 'Schedule'}
        </Button>
      </div>
    </>
  )
}
