import type { Block, CollectionSlug, UIFieldServerComponent } from 'payload'
import { findReferences, type DocumentReferences } from './find.js'

/*
"Used on", in a document's sidebar.

The other half of the delete guard, and the same query. Without it an editor
cannot tell a shared asset from a single-use one: forumone-2026 had five
`ImageHero` blocks pointing at one stock photograph and nothing in the admin
said so, so changing the image on one page changed it on five.

**A server component, so the scan runs where the data is.** A client component
would need an endpoint of its own: a second public surface for something the
admin already has a session for.

**It renders nothing rather than failing.** A panel is an aid and the control is
the guard. If the scan throws, the document still has to open; the guard makes
the opposite choice, deliberately.

`referencesPlugin` adds it as a sidebar `ui` field. Extra blocks, when a host
passes any, ride on the field's `custom.references.blocks`.
*/

function adminHref(entry: DocumentReferences, adminRoute: string): string {
  return entry.global
    ? `${adminRoute}/globals/${entry.collection}`
    : `${adminRoute}/collections/${entry.collection}/${String(entry.id)}`
}

export const UsedOnPanel: UIFieldServerComponent = async ({
  id,
  collectionSlug,
  field,
  payload,
  req,
}) => {
  // The create view has no document yet, so there is nothing to count.
  if (id === undefined || id === null || !collectionSlug) return null

  const blocks = (field.custom as { references?: { blocks?: readonly Block[] } } | undefined)
    ?.references?.blocks
  let found: DocumentReferences[]
  try {
    found = await findReferences(
      payload,
      { collection: collectionSlug as CollectionSlug, id },
      {
        req,
        ...(blocks ? { blocks } : {}),
      },
    )
  } catch {
    return null
  }

  const adminRoute = payload.config.routes.admin
  const inBlocks = found.filter((entry) => entry.viaBlock).length

  return (
    <div className="field-type">
      <div className="field-label">Used on</div>
      {found.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nothing uses this. It is safe to delete.</p>
      ) : (
        <>
          <p style={{ opacity: 0.7 }}>
            {found.length} document{found.length === 1 ? '' : 's'}. Editing this changes
            {found.length === 1 ? ' it' : ' all of them'}.
            {inBlocks > 0 ? ` ${inBlocks} use it inside a block.` : ''}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {found.map((entry) => (
              <li key={`${entry.collection}:${String(entry.id)}`} style={{ marginBottom: '.5rem' }}>
                <a href={adminHref(entry, adminRoute)}>{entry.label}</a>
                <div style={{ opacity: 0.7, fontSize: '.8em' }}>
                  {entry.collectionLabel ?? entry.collection}
                  {/* The place says which block to open: a document can hold several. */}
                  {entry.references.map((reference) => (
                    <div key={reference.path}>{reference.where ?? reference.path}</div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
