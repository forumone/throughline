import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPROVALS_SLUG,
  createApprovalsCollection,
} from './collection.js'

describe('createApprovalsCollection', () => {
  it('uses the default slug', () => {
    expect(createApprovalsCollection({ groupSlugs: ['editorial'] }).slug).toBe(DEFAULT_APPROVALS_SLUG)
  })

  it('honors a custom slug and usersSlug', () => {
    const config = createApprovalsCollection({
      slug: 'my-approvals',
      usersSlug: 'editors',
      groupSlugs: ['editorial'],
    })
    expect(config.slug).toBe('my-approvals')
    const requestedBy = config.fields.find((f) => 'name' in f && f.name === 'requestedBy')
    expect(requestedBy).toMatchObject({ relationTo: 'editors' })
  })

  it('exposes group slugs as select options on approverGroups', () => {
    const config = createApprovalsCollection({ groupSlugs: ['legal', 'editorial'] })
    const approverGroups = config.fields.find((f) => 'name' in f && f.name === 'approverGroups') as {
      options: Array<{ value: string }>
    }
    expect(approverGroups.options.map((o) => o.value)).toEqual(['legal', 'editorial'])
  })

  it('grants read to admin / editor / approver roles', () => {
    const config = createApprovalsCollection({ groupSlugs: ['editorial'] })
    const read = config.access?.read as (a: { req: unknown }) => boolean
    expect(read({ req: { user: { roles: ['admin'] } } })).toBe(true)
    expect(read({ req: { user: { roles: ['editor'] } } })).toBe(true)
    expect(read({ req: { user: { roles: ['approver'] } } })).toBe(true)
    expect(read({ req: { user: { roles: ['viewer'] } } })).toBe(false)
  })

  it('denies create and delete to all callers', () => {
    const config = createApprovalsCollection({ groupSlugs: ['editorial'] })
    const access = config.access ?? {}
    expect((access.create as () => boolean)()).toBe(false)
    expect((access.delete as () => boolean)()).toBe(false)
  })

  it('restricts update to admins only', () => {
    const config = createApprovalsCollection({ groupSlugs: ['editorial'] })
    const update = config.access?.update as (a: { req: unknown }) => boolean
    expect(update({ req: { user: { roles: ['admin'] } } })).toBe(true)
    expect(update({ req: { user: { roles: ['editor'] } } })).toBe(false)
  })

  it('declares the expected status options', () => {
    const config = createApprovalsCollection({ groupSlugs: ['editorial'] })
    const status = config.fields.find((f) => 'name' in f && f.name === 'status') as {
      options: Array<{ value: string }>
    }
    expect(status.options.map((o) => o.value)).toEqual([
      'pending',
      'granted',
      'declined',
      'changes-requested',
      'expired',
    ])
  })
})
