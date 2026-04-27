// Placeholder; real prompts arrive in C13.2-3.
export interface Answers {
  targetDir: string
  projectName: string
  packageScope: string
  useReferenceDs: boolean
  initializeGit: boolean
  installDeps: boolean
  deploymentPlatform: 'vercel' | 'railway' | 'fly' | 'other'
  databasePlatform: 'neon' | 'supabase' | 'self-hosted-postgres'
}

export function validateProjectName(value: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'Use lowercase letters, numbers, and hyphens only (must start with a letter or number)'
  }
  return undefined
}

export async function gatherAnswers(_options: { targetDir: string }): Promise<Answers> {
  throw new Error('not yet implemented')
}
