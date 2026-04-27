import type { Access, CollectionConfig } from 'payload'
import { AUDIT_ACTIONS, AUDIT_MCP_SERVERS } from './types.js'

export interface AuditCollectionOptions {
  /** Override the collection slug. Default: `'audit-events'`. */
  slug?: string
  /**
   * Read access function. Receives the standard Payload access args.
   * Defaults to admin/editor roles.
   */
  readAccess?: Access
}

export const DEFAULT_AUDIT_SLUG = 'audit-events'

const defaultReadAccess: Access = ({ req }) => {
  const roles = (req.user?.['roles'] as string[] | undefined) ?? []
  return roles.includes('admin') || roles.includes('editor')
}

/**
 * Builds the audit-events collection config. The collection is read-only
 * from outside the writer: `create`, `update`, and `delete` are denied
 * for all callers; the writer uses Payload's local API which bypasses
 * these checks.
 */
export function createAuditCollection(options: AuditCollectionOptions = {}): CollectionConfig {
  const slug = options.slug ?? DEFAULT_AUDIT_SLUG

  return {
    slug,
    admin: {
      useAsTitle: 'summary',
      defaultColumns: ['createdAt', 'actor', 'action', 'targetCollection', 'targetId'],
      description:
        'Immutable record of every consequential action in the system. Read-only through the admin.',
    },
    access: {
      read: options.readAccess ?? defaultReadAccess,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      {
        name: 'createdAt',
        type: 'date',
        required: true,
        defaultValue: () => new Date().toISOString(),
        admin: { position: 'sidebar', readOnly: true },
      },
      {
        name: 'actor',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'select',
            required: true,
            options: [
              { label: 'User', value: 'user' },
              { label: 'System', value: 'system' },
              { label: 'Integration', value: 'integration' },
            ],
          },
          { name: 'userId', type: 'text' },
          { name: 'userName', type: 'text' },
          { name: 'apiKeyName', type: 'text' },
          { name: 'apiKeyId', type: 'text' },
          { name: 'sessionId', type: 'text' },
        ],
      },
      {
        name: 'action',
        type: 'select',
        required: true,
        options: AUDIT_ACTIONS.map((value) => ({ label: value, value })),
      },
      {
        name: 'mcpServer',
        type: 'select',
        required: true,
        options: AUDIT_MCP_SERVERS.map((value) => ({ label: value, value })),
      },
      { name: 'mcpTool', type: 'text', required: true },
      { name: 'targetCollection', type: 'text' },
      { name: 'targetId', type: 'text' },
      { name: 'targetTitle', type: 'text' },
      {
        name: 'prompt',
        type: 'textarea',
        admin: { description: "The user's natural-language prompt, if surfaced via _meta." },
      },
      {
        name: 'reasoning',
        type: 'textarea',
        admin: { description: "Claude's reasoning, if surfaced via _meta." },
      },
      { name: 'changesSummary', type: 'textarea' },
      { name: 'summary', type: 'text', required: true },
      {
        name: 'diff',
        type: 'json',
        admin: {
          description: 'Before/after fields for update operations; null for reads.',
        },
      },
      { name: 'success', type: 'checkbox', defaultValue: true },
      { name: 'errorMessage', type: 'text' },
      { name: 'approvalRequestId', type: 'text' },
      { name: 'integrationId', type: 'text' },
    ],
    indexes: [
      { fields: ['createdAt'] },
      { fields: ['actor.userId', 'createdAt'] },
      { fields: ['targetCollection', 'targetId', 'createdAt'] },
      { fields: ['action', 'createdAt'] },
      { fields: ['mcpServer', 'createdAt'] },
    ],
    timestamps: false,
  }
}
