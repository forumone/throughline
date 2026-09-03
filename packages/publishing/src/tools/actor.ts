import type { AuthenticatedUser, McpToolContext } from '@forumone/throughline-plugin-contract'
import type { PublishingActor } from '../service.js'

/*
Who an MCP publishing call runs as, and the refusal when the answer is nobody.

Every other Throughline MCP server gates its tools. This one gated none, and
the consequence was not a role boundary that was too wide — it was the absence
of one. `publish`, `unpublish`, `rollback` and `schedulePublish` built their
actor as:

    actor: { user: ctx.user, apiKeyName: ctx.apiKeyName, channel: 'mcp' }

with no `enforceAccessAs`. That field is the *only* thing that makes the service
enforce collection access — `service.ts:123-124` and `:211-212` add
`{ user, overrideAccess: false }` when it is set and nothing when it is not — so
every read and write ran at the Local API default of `overrideAccess: true`.
Net effect: publish, unpublish, roll back or schedule **any document in any of
the six content collections, with no authorization check at all**. `rollback`
was worse again: it called `payload.restoreVersion` with no user and no override
flag whatever.

## Why this is a guard and not a role check

The obvious fix is a role gate mirroring `isIntegrationsAdmin`. That is the
wrong shape here, and the reason is that the admin HTTP path already solves
this correctly: `endpoints/admin.ts:47-49` requires `req.user` and `:85-89`
sets `enforceAccessAs: req.user`, then **deliberately checks no role** and lets
the collection's own `update` rule decide. In the consuming app that rule is
`isEditor`, so an approver is refused and an editor is not, without this
package needing to know either fact.

So the MCP path does not need a new policy. It needs to participate in the one
that already exists. Two lines: refuse when there is no user, and hand that
user to the service as the principal to enforce against.

## The refusal is load-bearing on its own

`plugin-mcp` never assigns `req.user` — it mutates `docs[0].user` and passes it
separately to its own CRUD tools — so for a `Bearer`-authenticated MCP call
Throughline's `contextFrom(req)` reads `req.user` and finds **null**. That is
why the audit, integrations and approvals servers correctly deny, and why
publishing did not: they check, and it did not. The `!ctx.user` branch below is
therefore the branch that actually fires today, and the `enforceAccessAs` half
is what holds once a call does arrive with an identity.
*/

/** A tool result that refused before doing anything. */
export interface ActorRefusal {
  error: string
}

/**
 * A publishing actor that is known to carry an identity.
 *
 * Both fields are non-optional, which is the invariant the guard establishes
 * and is worth having in the type rather than only in a comment: `user` is
 * what the audit row attributes the action to, and `enforceAccessAs` is what
 * makes the write consult collection access. A `PublishingActor` with either
 * absent is exactly the actor the five tools used to build, so narrowing here
 * means the old shape no longer typechecks at these call sites.
 */
export interface EnforcedPublishingActor extends PublishingActor {
  user: AuthenticatedUser
  enforceAccessAs: NonNullable<PublishingActor['enforceAccessAs']>
  /** Definite, because `McpToolContext` types it as a required string. */
  apiKeyName: string
}

/**
 * The actor to run a publishing call as, or a refusal to return unchanged.
 *
 * Callers narrow on `'error' in resolved`. Returning the envelope rather than
 * throwing matches every other gated tool in the suite — `query-audit.ts`'s
 * `deniedEnvelope`, `trigger-sync.ts`, `respond-to-approval.ts` — so a refused
 * MCP call reads as a refusal to the model rather than as a server fault.
 */
export function resolvePublishingActor(
  ctx: Pick<McpToolContext, 'user' | 'apiKeyName'>,
  channel: 'mcp' = 'mcp',
): EnforcedPublishingActor | ActorRefusal {
  if (!ctx.user) {
    return {
      error:
        'Must be authenticated to use the publishing tools. An API key alone does not carry an ' +
        'identity to enforce collection access against.',
    }
  }

  return {
    user: ctx.user,
    apiKeyName: ctx.apiKeyName,
    channel,
    /*
    The whole point. Without this the service runs at `overrideAccess: true`
    and the collection's `update` rule — the thing that distinguishes an editor
    from an approver — is never consulted.

    One cast, and it is the kind audit 02 F-06 calls the acceptable shape: the
    two types genuinely disagree and the comment says how. `AuthenticatedUser`
    is this package's local shape — `{ id, email, name, roles, groups }` — while
    `TypedUser` is generated from the consuming app's own `users` collection.
    They describe the same row, but only the app that owns that collection can
    say so, and this package may not import from `apps/` (see the boundary rule
    in the repository's CLAUDE.md, enforced by `pnpm check:boundary`).

    What the value is used for downstream bounds the risk: Payload passes it to
    `update`/`findByID` as `user`, and the access functions read `id` and
    `roles` off it. Both are present and both are the same type on either side.
    */
    enforceAccessAs: ctx.user as unknown as NonNullable<PublishingActor['enforceAccessAs']>,
  }
}
