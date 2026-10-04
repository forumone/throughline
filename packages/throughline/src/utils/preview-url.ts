import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

/**
 * Where a person sees this document's draft: the collection's own
 * `admin.preview`, made absolute against `serverURL`. `null` when the
 * collection has none, or it answers nothing for this document.
 *
 * The site's `admin.preview` decides what a preview link is and what it asks
 * of the person who opens it, so the link an agent hands over is the one the
 * admin's Preview button opens, with the same sign-in behind it. Shared by the
 * content tools, which return it after a write, and `get_publish_status`.
 */
export async function previewUrl(
  payload: Payload,
  collection: string,
  doc: Record<string, unknown>,
  req: PayloadRequest,
): Promise<string | null> {
  const preview = payload.collections[collection as CollectionSlug]?.config.admin?.preview
  if (typeof preview !== 'function') return null
  try {
    const url = await preview(doc, { locale: req.locale ?? undefined, req, token: null } as never)
    if (typeof url !== 'string' || url === '') return null
    return url.startsWith('/') ? `${payload.config.serverURL ?? ''}${url}` : url
  } catch {
    return null
  }
}
