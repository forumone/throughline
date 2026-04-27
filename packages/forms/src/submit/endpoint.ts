import type { Endpoint, Payload, PayloadHandler, PayloadRequest } from 'payload'
import type { ResolvedFormsConfig } from '../options.js'
import { checkHoneypot } from './spam.js'
import { extractClientIp, hashIp } from './ip.js'
import { checkRateLimit } from './rate-limit.js'

interface SubmitBody {
  formId?: string
  data?: Record<string, unknown>
  consent?: boolean
  /** Honeypot field. Real submitters never see it; bots fill it. */
  _hp?: unknown
}

/**
 * Builds the public submit endpoint. Performs (in order):
 * 1. Honeypot check — silently 200 if filled (so bots don't learn the trick).
 * 2. Form lookup — 404 if missing.
 * 3. Consent enforcement — server-side; client bypass doesn't work.
 * 4. Rate limit per (form, IP-hash) per hour.
 * 5. Persist a sanitized submission row.
 * 6. Fire `form/submission.received` for the fan-out worker.
 */
export function createSubmitEndpoint(resolved: ResolvedFormsConfig): Endpoint {
  const submitPath = `${resolved.routePrefix}/submit`

  const handler: PayloadHandler = async (req) => {
      let body: SubmitBody
      try {
        body = (await req.json?.()) as SubmitBody
      } catch {
        return jsonResponse({ error: 'Invalid JSON body.' }, 400)
      }

      const { formId, data, consent, _hp } = body
      if (typeof formId !== 'string' || formId.length === 0) {
        return jsonResponse({ error: 'formId is required.' }, 400)
      }

      // Honeypot: silently accept so bots don't pivot when they detect a 4xx.
      if (!checkHoneypot(_hp)) {
        return jsonResponse({ ok: true }, 200)
      }

      const payload = req.payload as Payload
      let form: Record<string, unknown> | null = null
      try {
        form = (await payload.findByID({
          collection: resolved.formsCollectionSlug,
          id: formId,
        })) as Record<string, unknown> | null
      } catch {
        form = null
      }
      if (!form) return jsonResponse({ error: 'Form not found.' }, 404)

      const policy = (form['policy'] ?? {}) as Record<string, unknown>
      const requiresConsent = policy['requiresExplicitConsent'] === true
      if (requiresConsent && consent !== true) {
        return jsonResponse({ error: 'Consent is required.' }, 400)
      }

      const headers = req.headers as Headers
      const ip = extractClientIp(headers)
      const ipHash = await hashIp(ip, resolved.ipHashSecret)

      const formRateLimit = readNumber(
        ((policy['spamProtection'] ?? {}) as Record<string, unknown>)['rateLimit'],
      )
      const limit = formRateLimit ?? resolved.rateLimit
      const rate = await checkRateLimit({
        payload,
        formId,
        ipHash,
        limit,
        collectionSlug: resolved.submissionsCollectionSlug,
      })
      if (!rate.ok) {
        return jsonResponse({ error: 'Too many submissions. Try again later.' }, 429)
      }

      const submission = await payload.create({
        collection: resolved.submissionsCollectionSlug,
        data: {
          form: formId,
          submissionData: serializeSubmissionData(data ?? {}),
          consentGivenAt: requiresConsent ? new Date().toISOString() : null,
          ipHash,
        },
      })

      await resolved.options.inngest.send({
        name: 'form/submission.received',
        data: {
          formId,
          submissionId: String(submission.id),
          formTitle: typeof form['title'] === 'string' ? (form['title'] as string) : '(untitled)',
        },
      })

      return jsonResponse({ ok: true, submissionId: String(submission.id) })
  }

  return {
    path: submitPath,
    method: 'post',
    handler,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

/** Form Builder stores submission data as `[{ field, value }]` rows. */
function serializeSubmissionData(data: Record<string, unknown>): Array<{ field: string; value: string }> {
  return Object.entries(data).map(([field, value]) => ({
    field,
    value: stringify(value),
  }))
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

// Re-export the type assertion target so downstream code sees the right shape.
export type SubmitRequest = PayloadRequest & { json?: () => Promise<unknown> }
