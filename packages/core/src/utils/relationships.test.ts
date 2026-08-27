import { describe, expect, it } from 'vitest'
import { unwrapRelationshipId } from './relationships.js'

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
