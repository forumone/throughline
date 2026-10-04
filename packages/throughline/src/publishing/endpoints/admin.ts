import { APIError, type Endpoint, type PayloadRequest } from 'payload'
import { z } from 'zod'
import { TELL_AN_ADMINISTRATOR, UNEXPECTED_PROBLEM } from '../messages.js'
import { getPublishingService, toAuthenticatedUser } from '../service.js'

const BodySchema = z.object({
  collection: z.string().min(1),
  id: z.union([z.string().min(1), z.number()]),
  /** `schedule` only. */
  publishAt: z.string().datetime({ offset: true }).optional(),
})

type Action = 'publish' | 'unpublish' | 'schedule' | 'unschedule'

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
    {
      path: `${deps.routePrefix}/schedule`,
      method: 'post',
      handler: (req) => handle(req, deps, 'schedule'),
    },
    {
      path: `${deps.routePrefix}/unschedule`,
      method: 'post',
      handler: (req) => handle(req, deps, 'unschedule'),
    },
  ]
}

async function handle(
  req: PayloadRequest,
  deps: CreateAdminEndpointsDeps,
  action: Action,
): Promise<Response> {
  if (!req.user) {
    return json(
      {
        error: `Your sign-in has ended. Sign in again, then ${action === 'unschedule' ? 'cancel the schedule' : action}.`,
        code: 'signed-out',
      },
      401,
    )
  }

  /*
  The three below happen only through a bug in whatever called this — the
  admin's own controls always send a well-formed body — never through anything
  an editor did. So the editor reads the generic "unexpected problem", and the
  specifics go in `detail` for whoever is debugging the request.
  */
  let raw: unknown
  try {
    raw = await req.json?.()
  } catch {
    return badRequest(action, 'Invalid JSON body.')
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return badRequest(action, 'Expected a JSON body with `collection` and `id`.')
  }

  const { collection, publishAt } = parsed.data
  const id = String(parsed.data.id)

  if (action === 'schedule' && !publishAt) {
    return badRequest(action, 'Expected `publishAt`, an ISO 8601 time, to schedule.')
  }

  if (!deps.publishableSlugs.has(collection)) {
    return json(
      {
        error: `Publishing isn't set up for this kind of content. Please ${TELL_AN_ADMINISTRATOR}.`,
        code: 'not-publishable',
        detail: `Collection "${collection}" is not registered as publishable. Add it to publishingPlugin's collections option.`,
      },
      400,
    )
  }

  let service
  try {
    service = getPublishingService(req.payload)
  } catch {
    return json(
      {
        error: `Publishing isn't available right now. Try again in a minute; if it keeps happening, ${TELL_AN_ADMINISTRATOR}.`,
        code: 'not-initialized',
        detail: 'The publishing service is not attached to this Payload instance yet.',
      },
      503,
    )
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
        : action === 'unpublish'
          ? await service.unpublish(request)
          : action === 'schedule'
            ? await service.schedule({ ...request, publishAt: publishAt! })
            : await service.unschedule(request)
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
    return json({ error: UNEXPECTED_PROBLEM(action), code: 'unexpected' }, 500)
  }
}

function badRequest(action: Action, detail: string): Response {
  return json({ error: UNEXPECTED_PROBLEM(action), code: 'bad-request', detail }, 400)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
