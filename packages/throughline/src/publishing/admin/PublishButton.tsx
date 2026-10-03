'use client'

import React, { useCallback, useState } from 'react'
import {
  FormSubmit,
  toast,
  useConfig,
  useDocumentInfo,
  useForm,
  useFormModified,
  useTranslation,
} from '@payloadcms/ui'
import { callPublishingEndpoint, describeBlock, fieldErrorsFromBlock } from './publishing-client.js'

export interface ThroughlinePublishButtonProps {
  /** Route prefix the plugin is mounted under. Injected via `clientProps`. */
  routePrefix?: string
}

/**
 * Replaces Payload's Publish button on collections the publishing plugin
 * governs.
 *
 * The native button submits `_status: 'published'` straight to the update
 * endpoint, which the plugin's trust boundary rejects by design. This one
 * saves pending edits as a draft, then asks the publishing server to run the
 * pipeline — as the logged-in editor, over the session cookie, with no API
 * key. A block renders the failing step, its issues and its suggestion
 * instead of a generic error.
 *
 * On the create view this renders nothing: the pipeline's first step is
 * `exist`, so there is nothing to evaluate until the draft is saved.
 * Payload's own Save Draft button covers that step.
 */
export function PublishButton(props: ThroughlinePublishButtonProps = {}): React.ReactNode {
  const routePrefix = props.routePrefix ?? '/publishing'

  const {
    collectionSlug,
    hasPublishedDoc,
    hasPublishPermission,
    id,
    setHasPublishedDoc,
    setMostRecentVersionIsAutosaved,
    setUnpublishedVersionCount,
    unpublishedVersionCount,
    uploadStatus,
  } = useDocumentInfo()

  const { config } = useConfig()
  const { dispatchFields, getFields, setIsValid, setSubmitted, submit } = useForm()
  const modified = useFormModified()
  const { t } = useTranslation()
  const [publishing, setPublishing] = useState(false)

  const { api } = config.routes
  const serverURL = config.serverURL ?? ''

  const publish = useCallback(async () => {
    if (id === undefined || id === null || !collectionSlug || publishing) return
    setPublishing(true)

    try {
      // Persist pending edits first, as a draft. Payload writes those to the
      // versions table and leaves the published document alone, so the trust
      // boundary lets them through; the pipeline then evaluates what was
      // actually saved rather than what is on screen.
      //
      // `?draft=true` is what makes this a draft write. The `_status`
      // override only pins the intent when form state carries a `_status` of
      // its own, and mirrors what Payload's native Save Draft sends.
      if (modified) {
        const saved = await submit({
          action: `${serverURL}${api}/${collectionSlug}/${id}?draft=true&depth=0`,
          method: 'PATCH',
          overrides: { _status: 'draft' },
          skipValidation: true,
          // No toast for this write. It is a step inside publishing, not
          // something the editor asked for, and its success toast used to
          // land on top of the publish one — two overlapping notices for one
          // action, the first of which announced the lesser outcome.
          // Payload's own Save Draft button is untouched and still toasts.
          disableSuccessStatus: true,
        })
        // `submit` returns void and toasts its own error on most failures,
        // but falls through with a non-ok response when the body carries no
        // message. Check both so a failed save never reaches the pipeline.
        if (!saved || !saved.res.ok) return
      }

      const result = await callPublishingEndpoint({
        serverURL,
        apiRoute: api,
        routePrefix,
        action: 'publish',
        collection: collectionSlug,
        id,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      if (!result.body.published) {
        /*
        The pipeline's issues already name their fields; until now they only
        reached a toast, which left the editor reading `layout.7.image` and
        counting blocks. Dispatched into form state they render where the
        problem is — on the field, and as an error count on the collapsed
        block row containing it.

        `setSubmitted` is what makes them visible: a field shows its error
        only once the form has been submitted, and a publish with no pending
        edits never submits the form at all. `setIsValid(false)` mirrors what
        Payload does with the field errors from an ordinary save.

        The toast still lists everything, because an issue with no field — an
        embargo, a missing approval — has nowhere else to go.
        */
        const fieldErrors = fieldErrorsFromBlock(result.body, Object.keys(getFields()))
        if (fieldErrors.length > 0) {
          dispatchFields({ type: 'ADD_SERVER_ERRORS', errors: fieldErrors })
          setIsValid(false)
          setSubmitted(true)
        }

        const { title, description } = describeBlock(result.body, {
          markedFields: fieldErrors.length,
        })
        toast.error(title, {
          ...(description ? { description } : {}),
          duration: 10_000,
        })
        return
      }

      // Deliberately not resetting the form here. The draft save above
      // already merged the server's response into form state, so the fields
      // on screen are what was just written. Resetting from
      // `useDocumentInfo().data` — the document as it was when the view
      // mounted — would replace the editor's saved edits with the pre-edit
      // values and read as though the publish had silently discarded them.
      //
      // The status indicators below are what actually needs updating.
      setHasPublishedDoc(true)
      setUnpublishedVersionCount(0)
      setMostRecentVersionIsAutosaved(false)

      // The document is live either way. A warning means something
      // downstream of the publish didn't happen, which is worth saying
      // without implying the publish failed.
      const warnings = result.body.warnings ?? []
      if (warnings.length > 0) {
        toast.warning(t('version:published'), {
          description: warnings.join('\n'),
          duration: 10_000,
        })
      } else {
        toast.success(t('version:published'))
      }
    } finally {
      setPublishing(false)
    }
  }, [
    api,
    collectionSlug,
    dispatchFields,
    getFields,
    id,
    modified,
    publishing,
    routePrefix,
    serverURL,
    setHasPublishedDoc,
    setIsValid,
    setMostRecentVersionIsAutosaved,
    setSubmitted,
    setUnpublishedVersionCount,
    submit,
    t,
  ])

  if (!hasPublishPermission) return null
  // Create view — no document for the pipeline to evaluate yet.
  if (id === undefined || id === null || !collectionSlug) return null

  const canPublish =
    (modified || unpublishedVersionCount > 0 || !hasPublishedDoc) &&
    uploadStatus !== 'uploading' &&
    !publishing

  return (
    <FormSubmit
      buttonId="action-save"
      disabled={!canPublish}
      onClick={() => {
        void publish()
      }}
      size="medium"
      type="button"
    >
      {publishing ? t('version:publishing') : t('version:publishChanges')}
    </FormSubmit>
  )
}
