import { describe, expect, it } from 'vitest'
import { validatePackageScope, validateProjectName } from './prompts.js'

describe('validateProjectName', () => {
  it('accepts a simple slug', () => {
    expect(validateProjectName('my-project')).toBeUndefined()
    expect(validateProjectName('site2026')).toBeUndefined()
  })

  it('rejects empty input', () => {
    expect(validateProjectName('')).toBe('Project name is required')
  })

  it('rejects uppercase, underscores, dots', () => {
    expect(validateProjectName('MyProject')).toBeDefined()
    expect(validateProjectName('my_project')).toBeDefined()
    expect(validateProjectName('my.project')).toBeDefined()
  })

  it('rejects names starting with a hyphen', () => {
    expect(validateProjectName('-bad')).toBeDefined()
  })

  it('rejects names longer than 64 chars', () => {
    expect(validateProjectName('a'.repeat(65))).toBe('Project name must be 64 characters or fewer')
  })
})

describe('validatePackageScope', () => {
  it('accepts an empty string (no scope)', () => {
    expect(validatePackageScope('')).toBeUndefined()
  })

  it('accepts a valid scope without the leading @', () => {
    expect(validatePackageScope('forumone')).toBeUndefined()
    expect(validatePackageScope('acme-corp')).toBeUndefined()
  })

  it('rejects a scope that already includes the @', () => {
    expect(validatePackageScope('@forumone')).toBeDefined()
  })

  it('rejects uppercase and underscore', () => {
    expect(validatePackageScope('Forumone')).toBeDefined()
    expect(validatePackageScope('acme_corp')).toBeDefined()
  })

  it('rejects scopes longer than 39 chars', () => {
    expect(validatePackageScope('a'.repeat(40))).toBe('Scope must be 39 characters or fewer')
  })
})
