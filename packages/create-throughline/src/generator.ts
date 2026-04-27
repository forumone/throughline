// Placeholder; real generator arrives in C13.4.
import type { Answers } from './prompts.js'

export interface GenerateOptions {
  templatesDir?: string
  /** Skip running side effects like `git init` and `pnpm install` (used by tests). */
  skipSideEffects?: boolean
}

export async function generate(_answers: Answers, _options: GenerateOptions = {}): Promise<void> {
  throw new Error('not yet implemented')
}
