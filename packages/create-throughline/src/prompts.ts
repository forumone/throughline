import { existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { cancel, confirm, group, isCancel, select, text } from '@clack/prompts'

export type DeploymentPlatform = 'vercel' | 'railway' | 'fly' | 'other'
export type DatabasePlatform = 'neon' | 'supabase' | 'self-hosted-postgres'

export interface Answers {
  /** Absolute path to the directory the scaffolder will create. */
  targetDir: string
  /** Slug-style name written into root package.json. */
  projectName: string
  /** npm scope (without leading `@`); empty string means "no scope". */
  packageScope: string
  useReferenceDs: boolean
  initializeGit: boolean
  installDeps: boolean
  deploymentPlatform: DeploymentPlatform
  databasePlatform: DatabasePlatform
}

/** Validates a project name slug. Returns an error message or `undefined` if OK. */
export function validateProjectName(value: string): string | undefined {
  if (!value) return 'Project name is required'
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'Use lowercase letters, numbers, and hyphens only (must start with a letter or number)'
  }
  if (value.length > 64) return 'Project name must be 64 characters or fewer'
  return undefined
}

/** Validates an npm scope (without `@`). Empty string is allowed and means "no scope". */
export function validatePackageScope(value: string): string | undefined {
  if (value === '') return undefined
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'Use lowercase letters, numbers, and hyphens only, or leave blank'
  }
  if (value.length > 39) return 'Scope must be 39 characters or fewer'
  return undefined
}

export async function gatherAnswers({ targetDir }: { targetDir: string }): Promise<Answers> {
  const absoluteTarget = resolve(process.cwd(), targetDir)

  if (existsSync(absoluteTarget)) {
    cancel(`Directory "${targetDir}" already exists. Choose a different name or remove it.`)
    process.exit(1)
  }

  const defaultProjectName = basename(absoluteTarget) || 'throughline-project'

  const answers = await group(
    {
      projectName: () =>
        text({
          message: 'Project name (used in package.json):',
          initialValue: defaultProjectName,
          validate: (value) => validateProjectName(value),
        }),
      packageScope: () =>
        text({
          message: 'npm scope for internal workspace packages (without @, blank to skip):',
          placeholder: 'acme',
          initialValue: '',
          validate: (value) => validatePackageScope(value),
        }),
      useReferenceDs: () =>
        confirm({
          message: 'Use the Throughline reference design system as a starting point?',
          initialValue: true,
        }),
      deploymentPlatform: () =>
        select<DeploymentPlatform>({
          message: 'Where will this deploy?',
          options: [
            { value: 'vercel', label: 'Vercel', hint: 'Recommended for Phase 1' },
            { value: 'railway', label: 'Railway', hint: 'Long-running container' },
            { value: 'fly', label: 'Fly.io', hint: 'Long-running container' },
            { value: 'other', label: 'Other / decide later' },
          ],
        }),
      databasePlatform: () =>
        select<DatabasePlatform>({
          message: 'Postgres provider?',
          options: [
            { value: 'neon', label: 'Neon', hint: 'Recommended; branch-per-preview' },
            { value: 'supabase', label: 'Supabase' },
            { value: 'self-hosted-postgres', label: 'Self-hosted Postgres' },
          ],
        }),
      initializeGit: () =>
        confirm({
          message: 'Initialize a git repository?',
          initialValue: true,
        }),
      installDeps: () =>
        confirm({
          message: 'Install dependencies now? (you can do this later with `pnpm install`)',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        cancel('Cancelled.')
        process.exit(0)
      },
    },
  )

  if (isCancel(answers)) {
    cancel('Cancelled.')
    process.exit(0)
  }

  return {
    targetDir: absoluteTarget,
    ...answers,
  }
}
