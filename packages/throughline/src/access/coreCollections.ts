import type { Access, SanitizedConfig } from 'payload'

/*
Narrowing a collection Payload adds for itself, after the fact. From
forumone-2026's `access/coreCollections.ts` (audit 04 F-12 there).

`payload-locked-documents` ships with all four operations at `defaultAccess`,
which is `Boolean(user)`. So any authenticated principal (an approver, a
role-less account, an MCP API key) could read, create, update and delete every
lock row through a full REST surface. Two consequences:

- **Deleting locks defeats a control the publishing service depends on.** The
  publish and unpublish writes pass `overrideLock: false`, so that unpublishing a
  page somebody has open is a refusal. Deleting the lock first gets round it.
- **Creating them is an editorial denial of service.** One row per document
  makes every document read-only in the admin.

## Why a function on the sanitized config

There is no override point. The collection does not exist while the config is
written or while plugins run: `buildConfig` runs every plugin first and then
`sanitizeConfig` builds this collection. `lockDocuments: false` everywhere would
remove it, and `overrideLock: false` with it. What is left is to patch the
sanitized result:

```ts
export default buildConfig({ ... }).then(hardenCoreCollections)
```

Access functions are read per request off `collection.config.access`, so
replacing them there is the same as having declared them. It depends on the
slug, so it throws when the collection is missing rather than becoming a silent
no-op after a Payload upgrade renames it.
*/

/** Payload's own slug for the lock table. */
export const LOCKED_DOCUMENTS_SLUG = 'payload-locked-documents'

/** Default: a user whose `roles` include `admin` or `editor`. */
function editorsAndAdmins(user: unknown): boolean {
  const roles = (user as { roles?: unknown } | null | undefined)?.roles
  return Array.isArray(roles) && (roles.includes('admin') || roles.includes('editor'))
}

export interface HardenCoreCollectionsOptions {
  /**
   * Who may take, read and release document locks. A lock is created by
   * whoever opens a document for editing, so this must include everyone who
   * edits. Default: users with the `admin` or `editor` role.
   */
  canLock?: (user: unknown) => boolean
}

/**
 * Close the `defaultAccess` holes on the collections Payload adds for itself.
 * Mutates and returns the config. Throws if a collection it expects is absent,
 * because a silent no-op here is a reopened hole nobody would see.
 */
export function hardenCoreCollections(
  config: SanitizedConfig,
  options: HardenCoreCollectionsOptions = {},
): SanitizedConfig {
  const locked = config.collections.find((collection) => collection.slug === LOCKED_DOCUMENTS_SLUG)
  if (!locked) {
    throw new Error(
      `hardenCoreCollections: no "${LOCKED_DOCUMENTS_SLUG}" collection in the sanitized config. ` +
        'Payload has renamed or stopped adding it, and its access rules are no longer being narrowed.',
    )
  }

  const canLock = options.canLock ?? editorsAndAdmins
  const rule: Access = ({ req }) => canLock(req.user)
  locked.access = { ...locked.access, create: rule, read: rule, update: rule, delete: rule }
  return config
}
