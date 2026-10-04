import {
  APIError,
  type Block,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionSlug,
  type PayloadRequest,
} from 'payload'
import { describeReferences, findReferences, type DocumentReferences } from './find.js'

/*
Refuse to delete, or to trash, a document that other documents still use.

Moved from forumone-2026 (`media/refuseDeleteInUse.ts`, `hooks/refuseInUse.ts`,
`hooks/refuseTermDeleteInUse.ts`), which were three copies of one decision.

**Refuse rather than warn.** A warning is a dialog somebody clicks through. What
an editor needs, *which five pages*, is the same query either way, so the
refusal carries it, and the way forward is to remove the reference from those
documents: the work the warning would have asked for.

**No override.** A document that genuinely should go is one nothing points at
once the pages are edited. An override would be used to get past the message,
not to disagree with it.

**Fail closed.** If the scan throws, the delete is refused and says so. "Could
not check" must never read as "unused".

**The trash is why there are two halves.** Moving a document to the trash is an
update that sets `deletedAt`, so `beforeDelete` never runs, and a trashed
document reads as `null` wherever something populates it: the same silent hole
a delete leaves. So the check runs on the way into the trash too. Emptying the
trash later is a real delete and meets the other half.
*/

export interface ReferenceGuardOptions {
  /** What the document is called in the message: "file", "person", "term". Default "document". */
  noun?: string
  /**
   * What deleting it would do to the documents that use it, appended to the
   * refusal: "deleting it now would untag them without saying so".
   */
  consequence?: string
  /** Blocks beyond the config's registry. See `FindReferencesOptions.blocks`. */
  blocks?: readonly Block[]
}

type Verb = 'delete' | 'move to the trash'

/** The refusal an editor reads. Exported so a host can show the same words elsewhere. */
export function referenceRefusal(
  found: readonly DocumentReferences[],
  options: { noun?: string; verb?: Verb; consequence?: string } = {},
): string {
  const noun = options.noun ?? 'document'
  const verb = options.verb ?? 'delete'
  const count = found.length
  const then = verb === 'delete' ? 'delete it' : 'move it to the trash'
  const consequence = options.consequence ? ` — ${options.consequence}` : ''

  /*
  Block references are called out because they are the half nothing else would
  have said: a field reference at least shows as an empty control afterwards,
  where a block reference renders nothing at all.
  */
  const blocks = found.filter((entry) => entry.viaBlock).length
  const note =
    blocks > 0
      ? `\n\n${blocks} of these ${blocks === 1 ? 'uses' : 'use'} it inside a block, where nothing would have warned you and it would simply have stopped appearing.`
      : ''

  return `This ${noun} is still used by ${count} document${count === 1 ? '' : 's'}. Remove it there first, then ${then}${consequence}.\n\n${describeReferences(found)}${note}`
}

async function refuseIfReferenced(
  req: PayloadRequest,
  collection: CollectionSlug,
  id: number | string,
  verb: Verb,
  options: ReferenceGuardOptions,
): Promise<void> {
  const noun = options.noun ?? 'document'
  let found: DocumentReferences[]
  try {
    found = await findReferences(
      req.payload,
      { collection, id },
      {
        req,
        ...(options.blocks ? { blocks: options.blocks } : {}),
      },
    )
  } catch (error) {
    req.payload.logger.error(
      { event: 'references.scan-failed', collection, id, err: error },
      `Could not check whether this ${noun} is in use; refusing to ${verb} it`,
    )
    /*
    Public, or nobody reads it. Payload's `routeError` replaces the message of
    any error that is not public with "Something went wrong.", and a 500 is not
    public unless it says so — which is what editors saw instead of this
    (forumone-2026#805). 503 too, because it is the truer status: the check
    could not run, and trying again is the advice.
    */
    throw new APIError(
      `Could not check whether this ${noun} is still in use, so nothing has changed. Try again; if it keeps happening, tell a site administrator.`,
      503,
      undefined,
      true,
    )
  }

  if (found.length === 0) return

  req.payload.logger.info(
    {
      event: 'references.refused',
      collection,
      id,
      verb,
      documents: found.map((entry) => `${entry.collection}:${String(entry.id)}`),
    },
    `Refused to ${verb} a ${noun} that is still referenced`,
  )
  // 400: answerable, and the caller can fix it, which is what the list is for.
  throw new APIError(
    referenceRefusal(found, {
      noun,
      verb,
      ...(options.consequence ? { consequence: options.consequence } : {}),
    }),
    400,
  )
}

/** Whether this write puts the document in the trash: `deletedAt` set now and not before. */
export function movesToTrash(data: unknown, originalDoc: unknown): boolean {
  const next = (data as Record<string, unknown> | null | undefined)?.['deletedAt']
  const previous = (originalDoc as Record<string, unknown> | null | undefined)?.['deletedAt']
  return next !== null && next !== undefined && (previous === null || previous === undefined)
}

/** `beforeDelete`: refuse while anything references the document. */
export function refuseDeleteWhileReferenced(
  collection: CollectionSlug,
  options: ReferenceGuardOptions = {},
): CollectionBeforeDeleteHook {
  return async ({ req, id }) => refuseIfReferenced(req, collection, id, 'delete', options)
}

/**
 * `beforeChange`: refuse a write that moves the document to the trash while
 * anything references it. Every other write passes untouched and costs
 * nothing, since the scan reads the whole config.
 */
export function refuseTrashWhileReferenced(
  collection: CollectionSlug,
  options: ReferenceGuardOptions = {},
): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, req }) => {
    if (operation !== 'update' || !movesToTrash(data, originalDoc)) return data
    const id = (originalDoc as { id?: number | string } | undefined)?.id
    if (id === undefined) return data
    await refuseIfReferenced(req, collection, id, 'move to the trash', options)
    return data
  }
}
