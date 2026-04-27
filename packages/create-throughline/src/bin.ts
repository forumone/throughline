#!/usr/bin/env node
import { intro, outro, cancel, spinner } from '@clack/prompts'
import pc from 'picocolors'
import { gatherAnswers } from './prompts.js'
import { generate } from './generator.js'
import { printNextSteps } from './post-install.js'

const VERSION = '0.1.0'

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log()
  intro(`${pc.bgMagenta(pc.white(' Throughline '))} ${pc.dim(`v${VERSION}`)}`)

  const targetDir = process.argv[2]
  if (!targetDir) {
    cancel('Please provide a project name: pnpm create @forumone/throughline my-project')
    process.exit(1)
  }

  const answers = await gatherAnswers({ targetDir })

  const s = spinner()
  let active = false
  try {
    await generate(answers, {
      onProgress: (step) => {
        if (active) s.stop(step)
        s.start(step)
        active = true
      },
    })
    if (active) s.stop('Done')
  } catch (error) {
    if (active) s.stop(pc.red('Failed'))
    cancel(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  printNextSteps(answers)
  outro(pc.green('Ready.'))
}

main().catch((error: unknown) => {
  process.stderr.write(`${pc.red('Unexpected error:')} ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
