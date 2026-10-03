/**
 * One environment variable something needs before it can start, as data.
 *
 * A plugin that falls back to `process.env` at init exports a list of these
 * beside its factory — `approvalsPlugin` / `approvalsEnv`, `emailPlugin` /
 * `emailEnv` — and its own init check reads the same entries. A site hands
 * every list, plus its own variables, to `assertEnvironment` from
 * `@forumone/throughline`, which reports everything wrong in one error
 * before any plugin gets to throw on the first thing it finds.
 *
 * It describes the *environment fallback*. A site that passes the value as an
 * option instead (say `tokenSecret` from a secrets manager) leaves that
 * plugin's list out of its `assertEnvironment` call.
 */
export interface EnvRequirement {
  /** The variable's name, e.g. `APPROVAL_TOKEN_SECRET`. */
  readonly name: string
  /**
   * The shortest value accepted. For secrets that sign or key something,
   * where a short value is as bad as none.
   */
  readonly minLength?: number
  /**
   * Why it is needed and how to get one, in a sentence a person fixing a
   * deploy can act on. Printed beside the name; never include a value.
   */
  readonly why: string
}
