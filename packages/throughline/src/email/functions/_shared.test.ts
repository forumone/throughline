import { describe, expect, it } from 'vitest'
import {
  formatHumanDate,
  readApproverIds,
  targetKindFromCollection,
  unwrapRelationshipId,
} from './_shared.js'

describe('targetKindFromCollection', () => {
  it('maps known slugs to nouns', () => {
    expect(targetKindFromCollection('pages')).toBe('page')
    expect(targetKindFromCollection('posts')).toBe('post')
  })

  it('falls back to "item" for unknown collections', () => {
    expect(targetKindFromCollection('programs')).toBe('item')
  })
})

describe('unwrapRelationshipId', () => {
  it('passes through string IDs', () => {
    expect(unwrapRelationshipId('u-1')).toBe('u-1')
  })
  it('extracts id from objects', () => {
    expect(unwrapRelationshipId({ id: 42, name: 'X' })).toBe('42')
  })
  it('returns null when nothing is recognizable', () => {
    expect(unwrapRelationshipId(null)).toBeNull()
    expect(unwrapRelationshipId(undefined)).toBeNull()
    expect(unwrapRelationshipId({})).toBeNull()
  })
})

describe('readApproverIds', () => {
  it('returns the list when entries are plain strings', () => {
    expect(readApproverIds(['u-1', 'u-2'])).toEqual(['u-1', 'u-2'])
  })
  it('extracts ids from { id, ... } entries', () => {
    expect(
      readApproverIds([
        { id: 'u-1', at: 'now', channel: 'email' },
        { id: 'u-2' },
      ]),
    ).toEqual(['u-1', 'u-2'])
  })
  it('handles a missing or non-array value', () => {
    expect(readApproverIds(undefined)).toEqual([])
    expect(readApproverIds('not-an-array')).toEqual([])
  })
})

describe('formatHumanDate', () => {
  it('formats ISO dates as Mon DD, YYYY', () => {
    expect(formatHumanDate('2026-04-22T12:00:00.000Z')).toMatch(/Apr 22, 2026/)
  })
  it('falls back to the original string when unparseable', () => {
    expect(formatHumanDate('not-a-date')).toBe('not-a-date')
  })
})
