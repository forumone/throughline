import { z } from 'zod'

/**
 * Canonical env-var names used across Throughline packages. Plugins read
 * `process.env[ENV_VARS.X]` rather than hard-coding strings so renames stay
 * coordinated.
 */
export const ENV_VARS = {
  PAYLOAD_SECRET: 'PAYLOAD_SECRET',
  DATABASE_URI: 'DATABASE_URI',
  NEXT_PUBLIC_SERVER_URL: 'NEXT_PUBLIC_SERVER_URL',
  INNGEST_EVENT_KEY: 'INNGEST_EVENT_KEY',
  INNGEST_SIGNING_KEY: 'INNGEST_SIGNING_KEY',
  RESEND_API_KEY: 'RESEND_API_KEY',
  EMAIL_FROM_ADDRESS: 'EMAIL_FROM_ADDRESS',
  EMAIL_FROM_NAME: 'EMAIL_FROM_NAME',
  EMAIL_REPLY_TO: 'EMAIL_REPLY_TO',
  APPROVAL_TOKEN_SECRET: 'APPROVAL_TOKEN_SECRET',
  COMPONENT_SERVER_API_KEY: 'COMPONENT_SERVER_API_KEY',
  PUBLISHING_SERVER_API_KEY: 'PUBLISHING_SERVER_API_KEY',
  APPROVALS_SERVER_API_KEY: 'APPROVALS_SERVER_API_KEY',
  AUDIT_SERVER_API_KEY: 'AUDIT_SERVER_API_KEY',
  FORMS_SERVER_API_KEY: 'FORMS_SERVER_API_KEY',
  INTEGRATIONS_SERVER_API_KEY: 'INTEGRATIONS_SERVER_API_KEY',
} as const

export type EnvVarName = (typeof ENV_VARS)[keyof typeof ENV_VARS]

const BaseEnvSchema = z.object({
  [ENV_VARS.PAYLOAD_SECRET]: z
    .string()
    .min(32, `${ENV_VARS.PAYLOAD_SECRET} must be at least 32 characters`),
  [ENV_VARS.DATABASE_URI]: z.string().min(1, `${ENV_VARS.DATABASE_URI} must be set`),
  [ENV_VARS.NEXT_PUBLIC_SERVER_URL]: z.string().url(),
})

export type BaseEnv = z.infer<typeof BaseEnvSchema>

/**
 * Validates the base env vars every Throughline deployment requires.
 * Plugins extend with their own checks. Throws on validation failure with
 * a multi-line, path-qualified message.
 */
export function validateBaseEnv(env: NodeJS.ProcessEnv = process.env): BaseEnv {
  const result = BaseEnvSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${String(i.path[0] ?? '(root)')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}

/** Returns an env var, throwing with a clear error if missing or empty. */
export function requireEnv(name: string, message?: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(message ?? `Environment variable ${name} is required but not set`)
  }
  return value
}

/** Returns an optional env var or a fallback. */
export function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback
}
