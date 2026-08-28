import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { formatZodIssues } from './zod-issues.js'

/*
The two callers throw `new Error(\`Invalid …:\n${issues}\`)` at plugin
registration, so this string is the whole of what an operator sees when a config
is wrong — there is no field to attach it to and no admin screen to show it.
That is why the shape is asserted rather than just the presence of a message.
*/

function issuesFor(schema: z.ZodTypeAny, value: unknown): string {
  const result = schema.safeParse(value)
  if (result.success) throw new Error('expected the schema to reject this value')
  return formatZodIssues(result.error)
}

describe('formatZodIssues', () => {
  it('indents one issue per line, path first', () => {
    const schema = z.object({ name: z.string(), count: z.number() })

    expect(issuesFor(schema, { name: 1, count: 'x' }).split('\n')).toEqual([
      expect.stringMatching(/^ {2}- name: /),
      expect.stringMatching(/^ {2}- count: /),
    ])
  })

  it('joins a nested path with dots', () => {
    const schema = z.object({ seo: z.object({ title: z.string() }) })

    expect(issuesFor(schema, { seo: { title: 2 } })).toContain('- seo.title: ')
  })

  /*
  The case the `|| '(root)'` exists for. A refinement on the object itself
  produces an issue with an empty path, and `[].join('.')` is the empty string —
  which would render as `  - : message` and read like a bug in the formatter
  rather than a fact about the config.
  */
  it('names a schema-level issue (root) rather than nothing', () => {
    const schema = z
      .object({ from: z.number(), to: z.number() })
      .refine(value => value.to > value.from, { message: 'to must be after from' })

    expect(issuesFor(schema, { from: 5, to: 1 })).toBe('  - (root): to must be after from')
  })

  it('returns an empty string for an error carrying no issues', () => {
    expect(formatZodIssues(new z.ZodError([]))).toBe('')
  })
})
