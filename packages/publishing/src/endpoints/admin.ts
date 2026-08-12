import { APIError, type Endpoint, type PayloadRequest } from 'payload'
import { z } from 'zod'
import { getPublishingService, toAuthenticatedUser } from '../service.js'

const BodySchema = z.object({
  collection: z.string().min(1),
  id: z.union([z.string().min(1), z.number()]),
})

export interface CreateAdminEndpointsDeps {
  /** Route prefix the plugin is mounted under, e.g. `/publishing`. */
  routePrefix: string
  /** Collections registered as publishable; anything else is rejected. */
  publishableSlugs: Set<string>
}

/**
 * The admin's path into the pipeline.
 *
 * These endpoints authenticate off the Payload session cookie, so `req.user`
 * is the logged-in editor — no API key in the editorial publish path, and
 * the audit event records the person rather than a service principal. The
 * write still goes through the pipeline, and still runs with
 * `overrideAccess: false`, so neither the policy checks nor the collection's
 * access control are skipped.
 */
export function createAdminEndpoints(deps: CreateAdminEndpointsDeps): Endpoint[] {
  return [
    {
      path: `${deps.routePrefix}/publish`,
      method: 'post',
      handler: (req) => handle(req, deps, 'publish'),
    },
    {
      path: `${deps.routePrefix}/unpublish`,
      method: 'post',
      handler: (req) => handle(req, deps, 'unpublish'),
    },
  ]
}

async function handle(
  req: PayloadRequest,
  deps: CreateAdminEndpointsDeps,
  action: 'publish' | 'unpublish',
): Promise<Response> {
  if (!req.user) {
    return json({ error: 'You must be logged in to publish.' }, 401)
  }

  let raw: unknown
  try {
    raw = await req.json?.()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return json({ error: 'Expected a JSON body with `collection` and `id`.' }, 400)
  }

  const { collection } = parsed.data
  const id = String(parsed.data.id)

  if (!deps.publishableSlugs.has(collection)) {
    return json(
      {
        error: `Collection "${collection}" is not registered as publishable. Add it to publishingPlugin's collections option.`,
      },
      400,
    )
  }

  let service
  try {
    service = getPublishingService(req.payload)
  } catch {
    return json({ error: 'Publishing server not initialized.' }, 503)
  }

  const request = {
    collection,
    id,
    actor: {
      user: toAuthenticatedUser(req.user),
      enforceAccessAs: req.user,
      channel: 'admin' as const,
    },
  }

  try {
    const result =
      action === 'publish'
        ? await service.publish(request)
        : await service.unpublish(request)
    // A pipeline block is a real answer, not a transport failure: 200 with
    // the diagnostic so the admin can render `failedAt` / `reason` /
    // `issues` / `suggestion` rather than a generic error.
    return json(result, 200)
  } catch (error) {
    if (error instanceof APIError) {
      return json({ error: error.message }, error.status || 500)
    }
    req.payload.logger.error(
      { err: error },
      `[publishing] admin ${action} failed for ${collection}/${id}`,
    )
    return json({ error: `Could not ${action} this document.` }, 500)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
