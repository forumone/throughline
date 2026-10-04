import { z } from 'zod'

/*
The authoring workflows, as MCP prompts. A client such as Claude Desktop lists
them as commands the person picks, and a prompt costs nothing until it is
picked, so the step-by-step guidance lives here rather than in eight tool
descriptions that are sent with every request. forumone-2026#830.

`plugin-mcp` reads prompts whole at config time and makes a per-key checkbox
for each, so these are plain values: nothing in them needs `payload`.
*/

/** The shape `@payloadcms/plugin-mcp` takes in `mcp.prompts`. */
export interface PayloadMcpPrompt {
  name: string
  title: string
  description: string
  argsSchema: z.ZodRawShape
  handler: (args: Record<string, unknown>) => {
    messages: { role: 'user' | 'assistant'; content: { type: 'text'; text: string } }[]
  }
}

function say(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

const str = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const ALWAYS = [
  'Nothing goes live without my say-so: save drafts, run `check`, show me the preview link, and ask before calling `publish`.',
  'Use only fields and blocks `get` lists for the content type, and fill each block from its contract in `design_guide`.',
  'If `check` reports blockers, fix them all, then run it again.',
].join(' ')

export const AUTHORING_PROMPTS: PayloadMcpPrompt[] = [
  {
    name: 'draft_post',
    title: 'Draft a post',
    description:
      'Write a new post (or another article-like content type) from a topic and notes, as a draft.',
    argsSchema: {
      topic: z.string().describe('What the post is about.'),
      notes: z.string().optional().describe('Notes, an outline, or source text to work from.'),
      collection: z.string().optional().describe('The content type, if not posts.'),
    },
    handler: (args) =>
      say(
        [
          `Draft a ${str(args['collection']) ?? 'posts'} entry about: ${str(args['topic']) ?? '(ask me)'}.`,
          str(args['notes'])
            ? `Work from these notes:\n\n${str(args['notes'])}`
            : 'Ask me for notes or an outline if you need them.',
          `Start with \`get\` for the content type, so you know its fields and what publishing it requires. Use \`find\` with a \`kind\` to attach authors, tags or an image rather than inventing them. Write the body as { markdown }. Save it with \`save_draft\`.`,
          ALWAYS,
        ].join('\n\n'),
      ),
  },
  {
    name: 'build_landing_page',
    title: 'Build a landing page',
    description:
      'Compose a landing page from design-system blocks for a goal and an audience, as a draft.',
    argsSchema: {
      goal: z.string().describe('What the page should get a reader to do.'),
      audience: z.string().optional().describe('Who it is for.'),
      material: z.string().optional().describe('Copy, facts or links to use.'),
    },
    handler: (args) =>
      say(
        [
          `Build a landing page whose goal is: ${str(args['goal']) ?? '(ask me)'}.${str(args['audience']) ? ` It is for ${str(args['audience'])}.` : ''}`,
          str(args['material']) ? `Use this material:\n\n${str(args['material'])}` : '',
          "Plan the sections first and show me the outline. For each, ask `design_guide` with an `intent` and the blocks already chosen, and read the chosen component's contract before filling it. Only when no component fits a section, build one with `compose_section` — and tell me, because a person has to approve it before the page can publish.",
          'Save the page with `save_draft`, then refine individual sections with `edit_blocks` rather than resending the layout.',
          ALWAYS,
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
  },
  {
    name: 'get_ready_to_publish',
    title: 'Get it ready to publish',
    description:
      'Take an existing draft through every publishing check and, with your go-ahead, publish or request approval.',
    argsSchema: {
      what: z.string().describe('The document: its title, or a collection and id.'),
    },
    handler: (args) =>
      say(
        [
          `Get this ready to publish: ${str(args['what']) ?? '(ask me which document)'}.`,
          'Find it with `find`, then run `check`. Fix every blocker it reports — with `save_draft` for fields and `edit_blocks` for blocks — and run `check` again until it is clear.',
          'Then show me the preview link and a short summary of what changed, and ask whether to publish now, schedule it, or request approval. If `publish` says approval is required, ask me who should approve it and what to tell them, and file the request.',
        ].join('\n\n'),
      ),
  },
]
