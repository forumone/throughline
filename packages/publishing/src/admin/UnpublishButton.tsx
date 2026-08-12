'use client'

import React, { useCallback, useState } from 'react'
import {
  ConfirmationModal,
  PopupList,
  toast,
  useConfig,
  useDocumentInfo,
  useForm,
  useModal,
  useTranslation,
} from '@payloadcms/ui'
import { callPublishingEndpoint } from './publishing-client.js'

export interface ThroughlineUnpublishButtonProps {
  /** Route prefix the plugin is mounted under. Injected via `clientProps`. */
  routePrefix?: string
}

/**
 * Replaces Payload's Unpublish control on collections the publishing plugin
 * governs. Same reasoning as the Publish button: the native control writes
 * `_status: 'draft'` directly, which the trust boundary rejects. This one
 * routes through the publishing server so the unpublish is audited against
 * the logged-in editor and `content/page.unpublished` fires for
 * revalidation.
 */
export function UnpublishButton(
  props: ThroughlineUnpublishButtonProps = {},
): React.ReactNode {
  const routePrefix = props.routePrefix ?? '/publishing'

  const {
    collectionSlug,
    data,
    hasPublishedDoc,
    hasPublishPermission,
    id,
    incrementVersionCount,
    isTrashed,
    setHasPublishedDoc,
    setMostRecentVersionIsAutosaved,
    setUnpublishedVersionCount,
  } = useDocumentInfo()

  const { config } = useConfig()
  const { reset } = useForm()
  const { t } = useTranslation()
  const { toggleModal } = useModal()
  const [unpublishing, setUnpublishing] = useState(false)

  const modalSlug = `throughline-confirm-unpublish-${id}`
  const { api } = config.routes
  const serverURL = config.serverURL ?? ''

  const unpublish = useCallback(async () => {
    if (id === undefined || id === null || !collectionSlug || unpublishing) return
    setUnpublishing(true)

    try {
      const result = await callPublishingEndpoint({
        serverURL,
        apiRoute: api,
        routePrefix,
        action: 'unpublish',
        collection: collectionSlug,
        id,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      if (!result.body.unpublished) {
        toast.error(result.body.reason ?? t('error:unPublishingDocument'))
        return
      }

      await reset({ ...(data ?? {}), _status: 'draft' })
      incrementVersionCount()
      setUnpublishedVersionCount(1)
      setMostRecentVersionIsAutosaved(false)
      setHasPublishedDoc(false)

      const warnings = result.body.warnings ?? []
      if (warnings.length > 0) {
        toast.warning(t('version:unpublishedSuccessfully'), {
          description: warnings.join('\n'),
          duration: 10_000,
        })
      } else {
        toast.success(t('version:unpublishedSuccessfully'))
      }
    } finally {
      setUnpublishing(false)
    }
  }, [
    api,
    collectionSlug,
    data,
    id,
    incrementVersionCount,
    reset,
    routePrefix,
    serverURL,
    setHasPublishedDoc,
    setMostRecentVersionIsAutosaved,
    setUnpublishedVersionCount,
    t,
    unpublishing,
  ])

  if (!hasPublishPermission || !hasPublishedDoc || isTrashed) return null
  if (id === undefined || id === null || !collectionSlug) return null

  return (
    <React.Fragment>
      <PopupList.Button
        id="action-unpublish"
        onClick={() => {
          toggleModal(modalSlug)
        }}
      >
        {t('version:unpublish')}
      </PopupList.Button>
      <ConfirmationModal
        body={t('version:aboutToUnpublish')}
        confirmingLabel={t('version:unpublishing')}
        heading={t('version:confirmUnpublish')}
        modalSlug={modalSlug}
        onConfirm={() => {
          void unpublish()
        }}
      />
    </React.Fragment>
  )
}
