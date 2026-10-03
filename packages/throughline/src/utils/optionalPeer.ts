/**
 * Loads an optional peer dependency, and turns "Cannot find module" into an
 * error that says which feature needs it and how to install it.
 *
 * `resend`, React Email and `inngest` are optional peers of
 * `@forumone/throughline`: a site that sends no email, or runs on Payload Jobs,
 * never installs them. Each is imported where it is used, when it is used, so
 * the first a site hears of a missing one is the moment that feature runs —
 * and this is what it hears.
 */
export async function loadOptionalPeer<T>(
  name: string,
  feature: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (isMissingModule(error, name)) {
      throw new Error(
        `${feature} needs \`${name}\`, an optional peer of @forumone/throughline. Install it: pnpm add ${name}`,
        { cause: error },
      )
    }
    throw error
  }
}

function isMissingModule(error: unknown, name: string): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  return (
    (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && error.message.includes(name)
  )
}
