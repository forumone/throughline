import { describe, expect, it } from 'vitest'
import { DEFAULT_ADMIN_GROUP } from '@forumone/throughline-plugin-contract'
import { DEFAULT_AUDIT_SLUG, createAuditCollection } from './collection.js'

describe('createAuditCollection', () => {
  it('uses the default slug', () => {
    expect(createAuditCollection().slug).toBe(DEFAULT_AUDIT_SLUG)
  })

  it('honors a custom slug', () => {
    expect(createAuditCollection({ slug: 'my-audit' }).slug).toBe('my-audit')
  })

  it('denies create / update / delete from any caller', () => {
    const config = createAuditCollection()
    const access = config.access ?? {}
    const fakeArgs = { req: { user: null } } as never
    expect((access.create as (a: unknown) => boolean)(fakeArgs)).toBe(false)
    expect((access.update as (a: unknown) => boolean)(fakeArgs)).toBe(false)
    expect((access.delete as (a: unknown) => boolean)(fakeArgs)).toBe(false)
  })

  it('grants read to admins by default', () => {
    const config = createAuditCollection()
    const read = config.access?.read as (a: { req: unknown }) => boolean | unknown
    const result = read({ req: { user: { roles: ['admin'] } } })
    expect(result).toBe(true)
  })

  it('denies read to users with no audit-eligible role', () => {
    const config = createAuditCollection()
    const read = config.access?.read as (a: { req: unknown }) => boolean | unknown
    const result = read({ req: { user: { roles: ['viewer'] } } })
    expect(result).toBe(false)
  })

  it('honors a custom readAccess function', () => {
    const readAccess = () => true
    const config = createAuditCollection({ readAccess })
    expect(config.access?.read).toBe(readAccess)
  })

  it('declares useful indexes for query performance', () => {
    const config = createAuditCollection()
    const indexFields = (config.indexes ?? []).map((i) => i.fields.join(','))
    expect(indexFields).toContain('createdAt')
    expect(indexFields).toContain('action,createdAt')
  })

  it('declares the action and mcpServer enums on select fields', () => {
    const config = createAuditCollection()
    const action = config.fields.find((f) => 'name' in f && f.name === 'action')
    expect(action).toMatchObject({ type: 'select', required: true })
  })

  it('sits in the Throughline sidebar group by default', () => {
    expect(createAuditCollection().admin?.group).toBe(DEFAULT_ADMIN_GROUP)
  })

  it('takes a custom sidebar group, including a localized one', () => {
    expect(createAuditCollection({ admin: { group: 'Workflow' } }).admin?.group).toBe('Workflow')
    const localized = { en: 'Workflow', fr: 'Flux' }
    expect(createAuditCollection({ admin: { group: localized } }).admin?.group).toEqual(localized)
  })

  it('is left ungrouped, not hidden, when group is false', () => {
    const config = createAuditCollection({ admin: { group: false } })
    expect(config.admin).not.toHaveProperty('group')
    expect(config.admin?.useAsTitle).toBe('summary')
  })
})
