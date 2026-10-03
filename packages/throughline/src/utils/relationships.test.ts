import { describe, expect, it } from 'vitest'
import { relationshipIdFor, unwrapRelationshipId } from './relationships.js'

/*
Four copies of this existed, and they agreed on everything except a redundant
null guard. These pin the behaviour they shared, plus the one thing none of them
did.
*/
describe('unwrapRelationshipId', () => {
  it('passes a string id straight through', () => {
    expect(unwrapRelationshipId('abc')).toBe('abc')
  })

  it('takes the id off a populated document', () => {
    expect(unwrapRelationshipId({ id: 42, email: 'ada@example.com' })).toBe('42')
  })

  /*
  The one difference from all four originals. On Postgres at `depth: 0` a
  relationship is a number, and every copy returned `null` for it — a populated
  relationship read as absent. No caller reads at depth 0 today, so this fixes
  nothing and stops the shared helper being wrong for the first one that does.
  */
  it('accepts a numeric id, which none of the copies did', () => {
    expect(unwrapRelationshipId(7)).toBe('7')
  })

  const notRelationships: unknown[] = [null, undefined, {}, [], false, true]

  it.each(notRelationships)('answers null for %s, which is not a relationship', value => {
    expect(unwrapRelationshipId(value)).toBeNull()
  })
})

describe('relationshipIdFor', () => {
  const source = (defaultIDType: 'number' | 'text', customIDType?: 'number' | 'text') => ({
    collections: { users: customIDType ? { customIDType } : {} },
    db: { defaultIDType },
  })

  it('makes a number of a numeric id where the ids are numbers', () => {
    expect(relationshipIdFor(source('number'), 'users', '7')).toBe(7)
  })

  it('leaves the id alone where they are text', () => {
    expect(relationshipIdFor(source('text'), 'users', '7')).toBe('7')
  })

  it("follows a collection's own id field over the adapter's default", () => {
    expect(relationshipIdFor(source('number', 'text'), 'users', '7')).toBe('7')
    expect(relationshipIdFor(source('text', 'number'), 'users', '7')).toBe(7)
  })

  it('never makes a number of something that is not one', () => {
    expect(relationshipIdFor(source('number'), 'users', 'usr_1')).toBe('usr_1')
  })
})
