import { basename } from 'node:path'
import pc from 'picocolors'
import type { Answers } from './prompts.js'

/**
 * Prints a numbered punch list of post-install steps. Order is the order
 * a developer should follow; conditional steps (e.g. "pnpm install") only
 * appear when the corresponding answer was `false` so the list reads
 * cleanly either way.
 */
export function printNextSteps(answers: Answers): void {
  const lines: string[] = []
  let step = 1

  const dirName = basename(answers.targetDir)
  lines.push(formatStep(step++, `${pc.bold('cd')} ${dirName}`))

  if (!answers.installDeps) {
    lines.push(formatStep(step++, pc.bold('pnpm install')))
  }

  lines.push(
    formatStep(
      step++,
      `Copy ${pc.bold('.env.example')} to ${pc.bold('.env.local')} and fill in values`,
    ),
  )

  if (answers.databasePlatform === 'neon') {
    lines.push(`       ${pc.dim('- Create a Neon project; use its connection string for DATABASE_URI')}`)
  } else if (answers.databasePlatform === 'supabase') {
    lines.push(`       ${pc.dim('- Create a Supabase project; use the pooled connection string for DATABASE_URI')}`)
  } else {
    lines.push(`       ${pc.dim('- Provision a Postgres database and set DATABASE_URI to its connection string')}`)
  }

  lines.push(formatStep(step++, 'Generate required secrets:'))
  lines.push(`       ${pc.dim('openssl rand -base64 48  # PAYLOAD_SECRET')}`)
  lines.push(`       ${pc.dim('openssl rand -base64 48  # APPROVAL_TOKEN_SECRET')}`)
  lines.push(`       ${pc.dim('openssl rand -base64 48  # FORMS_IP_HASH_SECRET')}`)

  lines.push(formatStep(step++, `${pc.bold('pnpm dev')} to run locally`))
  lines.push(
    formatStep(
      step++,
      'Open http://localhost:3000/admin and create your first admin user',
    ),
  )
  lines.push(
    formatStep(step++, 'In the admin, create one key under MCP → Payload MCP API Keys'),
  )
  lines.push(
    formatStep(
      step,
      'Give that key to Claude (or your MCP client) for /api/mcp — see the generated README.md',
    ),
  )

  // eslint-disable-next-line no-console
  console.log()
  // eslint-disable-next-line no-console
  console.log(pc.bold('Next steps:'))
  // eslint-disable-next-line no-console
  console.log()
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line)
  }

  // eslint-disable-next-line no-console
  console.log()
  // eslint-disable-next-line no-console
  console.log(pc.dim('Customizations you will likely need to make:'))
  const customizations = [
    'Replace the example Pages collection with your content model',
    'Implement the groupResolver and user resolvers in payload.config.ts',
    'Add your destinations to the formsPlugin allowlist',
  ]
  if (!answers.useReferenceDs) {
    customizations.push('Point componentsPlugin at your design system manifest URL')
  }
  for (const item of customizations) {
    // eslint-disable-next-line no-console
    console.log(`  ${pc.dim(`- ${item}`)}`)
  }

  // eslint-disable-next-line no-console
  console.log()
}

function formatStep(n: number, body: string): string {
  return `${pc.cyan(`  ${n}.`)} ${body}`
}
