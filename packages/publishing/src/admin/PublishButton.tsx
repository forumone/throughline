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
import { callPublishingEndpoint, describeBlock } from './publishing-client.js'

export interface ThroughlinePublishButtonProps {
  /** Route prefix the plugin is mounted under. Injected via `clientProps`. */
  routePrefix?: string
  /** Publish-timestamp field for this collection. Injected via `clientProps`. */
  publishedAtField?: string
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
    data,
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
  const { reset, submit } = useForm()
  const modified = useFormModified()
  const { t } = useTranslation()
  const [publishing, setPublishing] = useState(false)

  const { api } = config.routes
  const serverURL = config.serverURL ?? ''

  const publish = useCallback(async () => {
    if (id === undefined || id === null || !collectionSlug || publishing) return
    setPublishing(true)

    try {
      // Persist pending edits first. Draft writes never touch `_status`, so
      // the trust boundary lets them through; the pipeline then evaluates
      // what was actually saved rather than what is on screen.
      if (modified) {
        const saved = await submit({
          action: `${serverURL}${api}/${collectionSlug}/${id}?draft=true&depth=0`,
          method: 'PATCH',
          overrides: { _status: 'draft' },
          skipValidation: true,
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
        const { title, description } = describeBlock(result.body)
        toast.error(title, {
          ...(description ? { description } : {}),
          duration: 10_000,
        })
        return
      }

      await reset({
        ...(data ?? {}),
        _status: 'published',
        ...(props.publishedAtField && result.body.publishedAt
          ? { [props.publishedAtField]: result.body.publishedAt }
          : {}),
      })
      setHasPublishedDoc(true)
      setUnpublishedVersionCount(0)
      setMostRecentVersionIsAutosaved(false)
      toast.success(t('version:published'))
    } finally {
      setPublishing(false)
    }
  }, [
    api,
    collectionSlug,
    data,
    id,
    modified,
    props.publishedAtField,
    publishing,
    reset,
    routePrefix,
    serverURL,
    setHasPublishedDoc,
    setMostRecentVersionIsAutosaved,
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
