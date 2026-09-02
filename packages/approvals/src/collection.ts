import type { CollectionConfig } from 'payload'

export interface CreateApprovalsCollectionOptions {
  /** Override the collection slug. Default: 'approvals'. */
  slug?: string
  /** Slug of the users collection that approver/requester relationships point at. Default: 'users'. */
  usersSlug?: string
  /** Allowed group slugs from the plugin's `groups` option. Used as the select options on the approverGroups field. */
  groupSlugs: string[]
}

export const DEFAULT_APPROVALS_SLUG = 'approvals'

/**
 * Builds the approvals collection config. The collection is read-mostly:
 * `create` is system-only (the plugin's tools mint records via the local
 * API), `update` is admin-only (so a stuck pending record can be corrected),
 * `delete` is denied (audit trail must remain).
 */
export function createApprovalsCollection(
  options: CreateApprovalsCollectionOptions,
): CollectionConfig {
  const slug = options.slug ?? DEFAULT_APPROVALS_SLUG
  const usersSlug = options.usersSlug ?? 'users'

  return {
    slug,
    admin: {
      useAsTitle: 'targetTitle',
      defaultColumns: ['targetTitle', 'status', 'requestedBy', 'requestedAt', 'expiresAt'],
      description:
        'Approval workflow state. Read-mostly through the admin; writes happen via the Approvals Server tools and the action endpoint.',
    },
    access: {
      read: ({ req }) => {
        const roles = (req.user?.['roles'] as string[] | undefined) ?? []
        return roles.includes('admin') || roles.includes('editor') || roles.includes('approver')
      },
      create: () => false,
      update: ({ req }) =>
        ((req.user?.['roles'] as string[] | undefined) ?? []).includes('admin'),
      delete: () => false,
    },
    fields: [
      // Target
      { name: 'targetCollection', type: 'text', required: true },
      { name: 'targetId', type: 'text', required: true },
      { name: 'targetTitle', type: 'text', required: true },
      {
        name: 'targetVersion',
        type: 'text',
        required: true,
        admin: {
          description:
            'Hash of the document content at request time. An approval resolves only against a document that still hashes to this, so a save that changed nothing keeps it and a save that changed something invalidates it.',
        },
      },
      { name: 'previewUrl', type: 'text' },

      // Request
      { name: 'requestedBy', type: 'relationship', relationTo: usersSlug, required: true },
      {
        name: 'requestedAt',
        type: 'date',
        required: true,
        defaultValue: () => new Date().toISOString(),
      },
      { name: 'requestReason', type: 'textarea' },
      { name: 'changesSummary', type: 'textarea', required: true },
      {
        name: 'approverGroups',
        type: 'select',
        hasMany: true,
        required: true,
        options: options.groupSlugs.map((s) => ({ label: s, value: s })),
      },

      // Decision
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'pending',
        options: [
          { label: 'Pending', value: 'pending' },
          { label: 'Granted', value: 'granted' },
          { label: 'Declined', value: 'declined' },
          { label: 'Changes requested', value: 'changes-requested' },
          { label: 'Expired', value: 'expired' },
        ],
      },
      { name: 'decidedBy', type: 'relationship', relationTo: usersSlug },
      { name: 'decidedAt', type: 'date' },
      { name: 'decisionNotes', type: 'textarea' },

      // Workflow state
      {
        name: 'notifiedApprovers',
        type: 'json',
        defaultValue: [],
        admin: { description: 'IDs of users notified for this request.' },
      },
      { name: 'expiresAt', type: 'date', required: true },
      {
        name: 'consumedTokens',
        type: 'json',
        defaultValue: [],
        admin: { description: 'Action tokens already consumed; prevents replay.' },
      },
    ],
    indexes: [
      { fields: ['targetCollection', 'targetId', 'status'] },
      { fields: ['status', 'expiresAt'] },
      { fields: ['requestedBy', 'requestedAt'] },
    ],
  }
}
