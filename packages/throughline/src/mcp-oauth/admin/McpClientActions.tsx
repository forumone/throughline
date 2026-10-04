'use client'

import React, { useState } from 'react'
import { Button, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation.js'

/*
The three things on the MCP pages that need the browser: copying, answering
the consent screen, and revoking a connection.

The consent answer is a `fetch` followed by `location.assign`, not a form post
that redirects. A form post's redirect to claude.ai or chatgpt.com is governed by
the page's `form-action` CSP, which a site is right to keep to `'self'`; a
navigation the script starts is not.
*/

export function CopyValue({ value, label }: { value: string; label?: string }): React.ReactNode {
  const [copied, setCopied] = useState(false)
  return (
    <div className="tl-mcp__copy">
      <code className="tl-mcp__value">{value}</code>
      <Button
        buttonStyle="secondary"
        size="small"
        margin={false}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? 'Copied' : (label ?? 'Copy')}
      </Button>
    </div>
  )
}

export function ConsentActions({
  request,
  allow = true,
  clientLabel,
}: {
  request: string
  /** False when the person may not connect: only Cancel is offered. */
  allow?: boolean
  clientLabel: string
}): React.ReactNode {
  const { config } = useConfig()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)

  async function answer(decision: 'allow' | 'deny') {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${config.serverURL ?? ''}${config.routes.api}/oauth/consent`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request, decision }),
      })
      const body = (await response.json()) as { redirect?: string; error?: string }
      if (body.redirect) {
        window.location.assign(body.redirect)
        return
      }
      setError(body.error ?? 'Something went wrong. Start again from the app.')
    } catch {
      setError('Something went wrong. Start again from the app.')
    }
    setBusy(false)
  }

  return (
    <div className="tl-mcp__actions">
      {allow && (
        <Button buttonStyle="primary" disabled={busy} onClick={() => void answer('allow')}>
          Allow {clientLabel}
        </Button>
      )}
      <Button buttonStyle="secondary" disabled={busy} onClick={() => void answer('deny')}>
        Cancel
      </Button>
      {error && (
        <p className="tl-mcp__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function RevokeConnectionButton({ id }: { id: number | string }): React.ReactNode {
  const { config } = useConfig()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)

  return (
    <>
      <Button
        buttonStyle="secondary"
        size="small"
        margin={false}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          void fetch(
            `${config.serverURL ?? ''}${config.routes.api}/oauth/grants/${String(id)}/revoke`,
            {
              method: 'POST',
              credentials: 'same-origin',
            },
          )
            .then(async (response) => {
              if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string }
                setError(body.error ?? 'Could not disconnect it.')
                setBusy(false)
                return
              }
              router.refresh()
            })
            .catch(() => {
              setError('Could not disconnect it.')
              setBusy(false)
            })
        }}
      >
        Disconnect
      </Button>
      {error && (
        <span className="tl-mcp__error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
